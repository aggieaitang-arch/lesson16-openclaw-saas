require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const PLANS = {
    free: { projectsMax: 1, reportsMax: 5, fullAgent: false },
    pro: { projectsMax: 10, reportsMax: 100, fullAgent: true },
    business: { projectsMax: 999999, reportsMax: 500, fullAgent: true }
};

const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const app = express();
//const PORT = 3001;
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

const requireUser = async (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
        return res.status(401).json({ status: "error", reply: "", error: "需要登入後才能使用 Agent" });
    }
    if (!supabaseAdmin) {
        return res.status(500).json({ status: "error", reply: "", error: "Supabase Service Role 後端環境變數尚未設定" });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
        return res.status(401).json({ status: "error", reply: "", error: "登入憑證無效或已過期" });
    }

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .single();

    // PGRST116 means this user has no subscription row yet: use the free plan.
    if (subscriptionError && subscriptionError.code !== "PGRST116") {
        return res.status(500).json({ status: "error", reply: "", error: "無法取得訂閱資料" });
    }

    const planId = subscription?.plan_id || "free";
    const status = subscription?.status || "active";
    const plan = PLANS[planId] || PLANS.free;

    if (status !== "active") {
        return res.status(403).json({ status: "error", reply: "", error: "目前訂閱狀態不可使用此功能" });
    }

    req.user = user;
    req.entitlements = plan;
    req.planId = planId;
    next();
};

app.post("/api/agent", requireUser, async (req, res) => {
    try {
        const message = req.body.message;
        const projectId = req.body.project_id;
        const projectName = req.body.project_name;

        if (!message) {
            return res.status(400).json({
                ok: false,
                error: "缺少 message"
            });
        }

        const now = new Date();
        const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const { data: usage, error: usageError } = await supabaseAdmin
            .from("usage_monthly")
            .select("*")
            .eq("user_id", req.user.id)
            .eq("period", period)
            .maybeSingle();

        if (usageError) {
            return res.status(500).json({ status: "error", reply: "", error: "無法取得本月使用額度" });
        }

        const reportsUsed = usage?.reports_used || 0;
        if (reportsUsed >= req.entitlements.reportsMax) {
            return res.status(429).json({
                status: "error",
                reply: "",
                error: "本月 AI 日報額度已用完，請升級方案",
                usage: { used: reportsUsed, limit: req.entitlements.reportsMax }
            });
        }

        const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";
        const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

        if (!gatewayToken) {
            return res.status(500).json({
                status: "error",
                reply: "",
                error: "OPENCLAW_GATEWAY_TOKEN 尚未設定"
            });
        }

        const gatewayResponse = await fetch(
            `${gatewayUrl}/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${gatewayToken}`,
                    "x-openclaw-agent-id": "main"
                },
                body: JSON.stringify({
                    model: "openclaw/default",
                    messages: [
                        {
                            role: "user",
                            content: `使用者：${req.user.email}\nProject ID：${projectId || "未指定"}\nProject 名稱：${projectName || "未指定"}\n\n${message}`
                        }
                    ]
                })
            }
        );

        if (!gatewayResponse.ok) {
            return res.status(502).json({
                status: "error",
                reply: "",
                error: "Agent 執行失敗，本次不扣額度"
            });
        }

        const data = await gatewayResponse.json();
        const newCount = reportsUsed + 1;
        const { error: usageUpdateError } = await supabaseAdmin
            .from("usage_monthly")
            .upsert({ user_id: req.user.id, period, reports_used: newCount });

        if (usageUpdateError) {
            return res.status(500).json({ status: "error", reply: "", error: "Agent 已完成，但無法更新使用額度" });
        }

        const reply = data?.choices?.[0]?.message?.content;

        return res.json({
            status: "success",
            reply: reply || "Agent 沒有回傳文字內容",
            error: null,
            plan_id: req.planId,
            entitlements: req.entitlements,
            usage: { used: newCount, limit: req.entitlements.reportsMax }
        });

    } catch (error) {
        return res.status(500).json({
            status: "error",
            reply: "",
            error: error.message
        });
    }
});

// app.listen(PORT, () => {
//     console.log(`[0914]Backend 已啟動：http://localhost:${PORT}`);
// });
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
});


app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "site-report-api",
        environment: process.env.RENDER ? "cloud" : "local"
    });
});

app.post("/api/cloud-test", (req, res) => {
    const message = req.body.message || "";

    res.json({
        ok: true,
        reply: `Cloud Backend 收到：${message}`
    });
});
