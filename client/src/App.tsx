import { FormEvent, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ArrowUpRight,
  Bot,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  FolderPlus,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  MessageSquareText,
  ScanLine,
  Sparkles,
  TerminalSquare,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from './lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

type ActionId = 'images' | 'report' | 'state';
type ResultStatus = 'idle' | 'running' | 'success' | 'error' | string;

type AgentResponse = {
  status?: string;
  reply?: string;
  error?: string;
  plan_id?: string;
  usage?: { used: number; limit: number };
};

type Project = {
  id: string;
  project_name: string;
};

type QuickAction = {
  id: ActionId;
  label: string;
  description: string;
  icon: LucideIcon;
  prompt: string;
};

const quickActions: QuickAction[] = [
  {
    id: 'images',
    label: '檢查新圖片',
    description: '比對現場進度與異常',
    icon: Camera,
    prompt: '請檢查今天新增的工地圖片，整理目前進度與需要注意的地方。',
  },
  {
    id: 'report',
    label: '產生日報',
    description: '整理今日施工摘要',
    icon: FileText,
    prompt: '請根據目前工地資料產生一份今日施工日報，包含進度、問題與明日待辦。',
  },
  {
    id: 'state',
    label: '查看目前 State',
    description: '掌握專案即時狀態',
    icon: ScanLine,
    prompt: '請彙整目前林宅客餐廳改造的 State，列出進度、風險與下一步。',
  },
];

const initialResult = {
  status: 'idle' as ResultStatus,
  reply: '等待你的指令，Agent 會在這裡回報處理結果。',
  error: '',
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState('');
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectMessage, setProjectMessage] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [planId, setPlanId] = useState('free');
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(initialResult);

  const loadProjects = async (): Promise<void> => {
    setIsLoadingProjects(true);
    const { data, error } = await supabase
      .from('projects')
      .select('id, project_name')
      .order('created_at', { ascending: false });

    setIsLoadingProjects(false);
    if (error) {
      setProjectMessage(error.message);
      return;
    }
    setProjects((data ?? []) as Project[]);
  };

  useEffect(() => {
    if (user) void loadProjects();
    else {
      setProjects([]);
      setCurrentProject(null);
    }
  }, [user]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setIsLoggingIn(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    setIsLoggingIn(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setUser(data.user);
  };

  const handleLogout = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(error.message);
      return;
    }

    setUser(null);
    setMessage('');
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!projectName.trim()) return;
    setProjectMessage('');

    const { data: { user: authenticatedUser } } = await supabase.auth.getUser();
    if (!authenticatedUser) {
      setProjectMessage('登入狀態已失效，請重新登入。');
      return;
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({ owner_id: authenticatedUser.id, project_name: projectName.trim() })
      .select('id, project_name')
      .single();

    if (error) {
      setProjectMessage(error.message);
      return;
    }

    const project = data as Project;
    setProjects((existingProjects) => [project, ...existingProjects]);
    setCurrentProject(project);
    setProjectName('');
  };

  const handleQuickAction = (action: QuickAction): void => {
    setPrompt(action.prompt);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!prompt.trim() || result.status === 'running') return;

    setResult({
      status: 'running',
      reply: '',
      error: '',
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('登入狀態已失效，請重新登入。');

      const response = await fetch(`${API_BASE_URL}/api/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: prompt.trim(),
          project_id: currentProject?.id,
          project_name: currentProject?.project_name,
        }),
      });
      const data = (await response.json()) as AgentResponse;

      if (data.plan_id) setPlanId(data.plan_id);
      if (data.usage) setUsage(data.usage);

      setResult({
        status: data.status ?? '',
        reply: data.reply ?? '',
        error: data.error ?? '',
      });
    } catch (error) {
      setResult({
        status: 'error',
        reply: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const isRunning = result.status === 'running';

  if (!user) {
    return (
      <main className="app-shell login-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <form className="login-card" onSubmit={handleLogin}>
          <div className="brand-mark"><Bot size={21} strokeWidth={2.2} /></div>
          <span className="section-kicker">SITE OPS / LOGIN</span>
          <h1>登入工地作業台</h1>
          <p>使用你的 Email 與密碼繼續。</p>
          <label className="input-label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <label className="input-label" htmlFor="password">密碼</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          {message && <p className="login-message" role="alert">{message}</p>}
          <button className="agent-button login-button" type="submit" disabled={isLoggingIn}>
            {isLoggingIn ? <LoaderCircle size={17} className="spin" /> : <LogIn size={17} />}
            {isLoggingIn ? '登入中' : '登入'}
          </button>
        </form>
      </main>
    );
  }

  if (!currentProject) {
    return (
      <main className="app-shell login-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <section className="login-card project-picker">
          <div className="brand-mark"><FolderPlus size={21} strokeWidth={2.2} /></div>
          <span className="section-kicker">SITE OPS / PROJECTS</span>
          <h1>選擇一個專案</h1>
          <p>登入帳號：{user.email}</p>
          <form onSubmit={handleCreateProject}>
            <label className="input-label" htmlFor="project-name">新增 Project</label>
            <div className="project-create-row">
              <input
                id="project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="例如：林宅客餐廳改造"
                required
              />
              <button className="agent-button" type="submit">新增</button>
            </div>
          </form>
          {projectMessage && <p className="login-message" role="alert">{projectMessage}</p>}
          <div className="project-list">
            {isLoadingProjects && <p>正在讀取 Projects…</p>}
            {!isLoadingProjects && projects.length === 0 && <p>尚無 Project，請先新增一個。</p>}
            {projects.map((project) => (
              <button key={project.id} className="project-item" type="button" onClick={() => setCurrentProject(project)}>
                <span>{project.project_name}</span><ChevronRight size={18} />
              </button>
            ))}
          </div>
          <button className="logout-button picker-logout" type="button" onClick={handleLogout}><LogOut size={14} /> 登出</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="page-wrap">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark"><Bot size={21} strokeWidth={2.2} /></div>
            <div>
              <p className="brand-name">林宅 AI 工地助理</p>
              <p className="brand-caption">LIN RESIDENCE / SITE OPS</p>
            </div>
          </div>
          <div className="topbar-meta">
            <span className="online-dot" />
            <span>系統運作中</span>
            <span className="meta-divider" />
            <span className="date-label">{user.email}</span>
            <button className="logout-button" type="button" onClick={handleLogout}>
              <LogOut size={14} /> 登出
            </button>
          </div>
        </header>

        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span /> PROJECT CONTROL ROOM</div>
            <h1>{currentProject.project_name}</h1>
            <p>把現場資訊交給 AI，讓每一次巡檢與決策都更清楚。</p>
          </div>
          <div className="project-status">
            <div className="status-icon"><MapPin size={18} /></div>
            <div>
              <span>目前專案</span>
              <strong>{currentProject.project_name}</strong>
            </div>
            <ChevronRight size={17} className="status-arrow" />
          </div>
        </section>

        <section className="workspace-grid">
          <div className="left-column">
            <div className="section-heading">
              <div>
                <span className="section-kicker">01 / QUICK ACTIONS</span>
                <h2>你想先處理什麼？</h2>
              </div>
              <Zap size={19} className="heading-icon" />
            </div>

            <div className="action-list">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    className="action-card"
                    key={action.id}
                    onClick={() => handleQuickAction(action)}
                    type="button"
                    disabled={isRunning}
                  >
                    <span className="action-index">0{index + 1}</span>
                    <span className="action-icon"><Icon size={20} /></span>
                    <span className="action-content">
                      <strong>{action.label}</strong>
                      <small>{action.description}</small>
                    </span>
                    <ArrowUpRight size={18} className="action-arrow" />
                  </button>
                );
              })}
            </div>

            <div className="context-card">
              <div className="context-icon"><ClipboardList size={18} /></div>
              <div>
                <span>今日現場摘要</span>
                <strong>等待最新巡檢資料</strong>
              </div>
              <Clock3 size={16} className="context-time" />
            </div>
          </div>

          <div className="right-column">
            <form className="command-panel" onSubmit={handleSubmit}>
              <div className="section-heading command-heading">
                <div>
                  <span className="section-kicker">02 / COMMAND CENTER</span>
                  <h2>交代一件事</h2>
                </div>
                <MessageSquareText size={20} className="heading-icon" />
              </div>
              <label className="input-label" htmlFor="agent-prompt">告訴 Agent 你需要什麼</label>
              <textarea
                id="agent-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：整理本週油漆工程進度，並列出還需要確認的事項。"
                rows={6}
                disabled={isRunning}
              />
              <div className="command-footer">
                <span className="input-hint"><Sparkles size={14} /> 支援自然語言指令</span>
                <button className="agent-button" type="submit" disabled={!prompt.trim() || isRunning}>
                  {isRunning ? <LoaderCircle size={17} className="spin" /> : <TerminalSquare size={17} />}
                  {isRunning ? '執行中' : '交給 Agent'}
                  {!isRunning && <ArrowUpRight size={16} />}
                </button>
              </div>
            </form>

            <section className={`result-panel result-${result.status}`}>
              <div className="result-header">
                <div>
                  <span className="section-kicker">03 / AGENT RESPONSE</span>
                  <h2>Result Panel</h2>
                </div>
                <div className="result-status">
                  {result.status === 'running' && <LoaderCircle size={14} className="spin" />}
                  {result.status === 'success' && <Check size={14} />}
                  {result.status === 'error' && <TriangleAlert size={14} />}
                  <span>{result.status}</span>
                </div>
              </div>
              <div className="result-body">
                <div className="usage-summary">
                  <span>Current Plan: <strong>{planId}</strong></span>
                  <span>AI Reports: <strong>{usage ? `${usage.used} / ${usage.limit}` : '尚未使用'}</strong></span>
                </div>
                <div className="result-row">
                  <span className="result-label">status</span>
                  <span className="result-value status-value">{result.status}</span>
                </div>
                <div className="result-row result-reply">
                  <span className="result-label">reply</span>
                  <p>{result.reply}</p>
                </div>
                <div className="result-row">
                  <span className="result-label">error</span>
                  <span className={`result-value ${result.status === 'error' ? 'error-text' : ''}`}>{result.error}</span>
                </div>
              </div>
            </section>
          </div>
        </section>

        <footer className="page-footer">
          <span>林宅客餐廳改造 / AI 工地作業台</span>
          <span>UI PREVIEW <span className="footer-dot" /> READY</span>
        </footer>
      </div>
    </main>
  );
}

export default App;
