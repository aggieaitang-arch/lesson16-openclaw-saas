require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
//const PORT = 3001;
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

app.post("/api/agent", async (req, res) => {
    try {
        const message = req.body.message;

        if (!message) {
            return res.status(400).json({
                ok: false,
                error: "缺少 message"
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

        const response = await fetch(
            `${gatewayUrl}/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${gatewayToken}`,
                    "x-openclaw-agent-id": "main"
                },
                body: JSON.stringify({
                    model: "openclaw",
                    messages: [
                        {
                            role: "user",
                            content: message
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                status: "error",
                reply: "",
                error: data?.error?.message || "OpenClaw Gateway 發生錯誤"
            });
        }

        const reply = data?.choices?.[0]?.message?.content;

        return res.json({
            status: "success",
            reply: reply || "Agent 沒有回傳文字內容",
            error: null
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
