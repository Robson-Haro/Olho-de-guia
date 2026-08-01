"use client";
import { useState } from "react";
import {
  Bird,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Crosshair,
  Database,
  Eye,
  EyeOff,
  Home,
  ListChecks,
  LockKeyhole,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Zap,
} from "lucide-react";

const nav = [
  { icon: Home, label: "Visão geral" },
  { icon: BriefcaseBusiness, label: "Vagas" },
  { icon: Crosshair, label: "Nova busca" },
  { icon: UsersRound, label: "Candidatos" },
  { icon: ListChecks, label: "Shortlist" },
  { icon: Database, label: "Banco de talentos" },
  { icon: Settings, label: "Configurações", admin: true },
];

export default function HomePage() {
  const [active, setActive] = useState("Visão geral"),
    [jobCode, setJobCode] = useState(""),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  const [jobEntryMode, setJobEntryMode] = useState<"gupy" | "manual">("gupy");
  const [manualJob, setManualJob] = useState({ title: "", city: "", description: "", keywords: "" });
  const [gupyToken, setGupyToken] = useState(""),
    [showToken, setShowToken] = useState(false),
    [configStatus, setConfigStatus] = useState<
      "idle" | "working" | "success" | "error"
    >("idle"),
    [configMessage, setConfigMessage] = useState("");
  const stats = [
    { label: "Perfis mapeados", value: "0", icon: UsersRound },
    { label: "Alta aderência", value: "0", icon: Target },
    { label: "Shortlists ativas", value: "0", icon: ListChecks },
    { label: "Tempo economizado", value: "0h", icon: Zap },
  ];
  async function importJob() {
    if (!jobCode.trim()) {
      setMessage("Digite o código da vaga.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/gupy/jobs/${jobCode.trim()}`),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível importar a vaga.");
      setMessage(
        `Vaga ${data.job?.name || data.job?.title || jobCode} importada com sucesso.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Erro ao importar vaga.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function configure(action: "test" | "save") {
    if (!gupyToken) {
      setConfigStatus("error");
      setConfigMessage("Cole o token da Gupy para continuar.");
      return;
    }
    setConfigStatus("working");
    setConfigMessage(
      action === "save"
        ? "Validando e protegendo o token..."
        : "Testando conexão com a Gupy...",
    );
    try {
      const response = await fetch("/api/admin/gupy-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: gupyToken, action }),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na configuração.");
      setConfigStatus("success");
      setConfigMessage(data.message);
      if (action === "save") setGupyToken("");
    } catch (error) {
      setConfigStatus("error");
      setConfigMessage(
        error instanceof Error
          ? error.message
          : "Erro ao configurar integração.",
      );
    }
  }
  function saveManualJob() {
    if (!manualJob.title.trim() || !manualJob.city.trim() || !manualJob.description.trim()) {
      setMessage("Preencha o título, a cidade e a descrição da vaga.");
      return;
    }
    const savedJobs = JSON.parse(localStorage.getItem("eureca_manual_jobs") || "[]");
    savedJobs.push({
      ...manualJob,
      keywords: manualJob.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("eureca_manual_jobs", JSON.stringify(savedJobs));
    setMessage(`Vaga ${manualJob.title.trim()} cadastrada manualmente com sucesso.`);
    setManualJob({ title: "", city: "", description: "", keywords: "" });
  }
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandmark">
            <Bird size={30} />
          </div>
          <div>
            <strong>EUREKA</strong>
            <span>TALENT HUNTER</span>
          </div>
        </div>
        <nav>
          {nav.map(({ icon: Icon, label, admin }) => (
            <button
              key={label}
              onClick={() => setActive(label)}
              className={active === label ? "active" : ""}
            >
              <Icon size={19} />
              <span>{label}</span>
              {admin && <span className="admin">ADMIN</span>}
            </button>
          ))}
        </nav>
        <div className="navBottom">
          <a href="https://robinho-minerva-foods1-muen.vercel.app/">
            <Home size={18} /> Portfólio
          </a>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">CENTRAL DE INTELIGÊNCIA</p>
            <h1>{active}</h1>
            <p>Encontre os talentos certos antes da concorrência.</p>
          </div>
          <div className="headerActions">
            {active !== "Configurações" && (
              <button
                className="configShortcut"
                onClick={() => setActive("Configurações")}
              >
                <Settings size={18} />
                <span>CONFIGURAR GUPY</span>
              </button>
            )}
            <div className="profile">
              <div className="statusDot" />
              <div>
                <strong>Usuário</strong>
                <span>Sistema Eureka</span>
              </div>
              <CircleUserRound size={36} />
            </div>
          </div>
        </header>
        {active === "Configurações" ? (
          <section className="settingsView">
            <article className="glass settingsCard">
              <div className="sectionTitle">
                <div>
                  <span className="kicker">
                    ACESSO EXCLUSIVO DO ADMINISTRADOR
                  </span>
                  <h2>Integração Gupy</h2>
                </div>
                <div
                  className={`connectionIcon ${configStatus === "success" ? "connected" : ""}`}
                >
                  <ShieldCheck size={30} />
                </div>
              </div>
              <p>
                Cadastre o token uma única vez. As analistas informarão apenas o
                código da vaga e nunca terão acesso à credencial.
              </p>
              <div className="securityBanner">
                <LockKeyhole size={21} />
                <div>
                  <strong>Token protegido</strong>
                  <span>Criptografia AES-256 no banco de dados.</span>
                </div>
              </div>
              <label>
                <span>Token da API Gupy</span>
                <div className="secureInput">
                  <ShieldCheck size={18} />
                  <input
                    type={showToken ? "text" : "password"}
                    value={gupyToken}
                    onChange={(e) => setGupyToken(e.target.value)}
                    placeholder="Cole o token aqui"
                    autoComplete="off"
                  />
                  <button
                    onClick={() => setShowToken(!showToken)}
                    aria-label="Mostrar ou ocultar token"
                  >
                    {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small>O token não volta a ser exibido depois de salvo.</small>
              </label>
              {configMessage && (
                <div className={`configNotice ${configStatus}`}>
                  {configStatus === "success" ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <ShieldCheck size={18} />
                  )}
                  <span>{configMessage}</span>
                </div>
              )}
              <div className="configActions">
                <button
                  className="secondary"
                  disabled={configStatus === "working"}
                  onClick={() => configure("test")}
                >
                  TESTAR CONEXÃO
                </button>
                <button
                  className={`primary ${configStatus === "success" ? "saved" : ""}`}
                  disabled={configStatus === "working"}
                  onClick={() => configure("save")}
                >
                  <ShieldCheck size={18} />
                  {configStatus === "working"
                    ? "PROCESSANDO..."
                    : configStatus === "success"
                      ? "CONFIGURAÇÃO ATIVA"
                      : "SALVAR CONFIGURAÇÃO"}
                </button>
              </div>
            </article>
            <aside className="glass setupGuide">
              <span className="kicker">STATUS DA INTEGRAÇÃO</span>
              <h3>Como funciona</h3>
              <ol>
                <li>
                  <b>Você</b> cadastra o token nesta área protegida.
                </li>
                <li>
                  <b>O sistema</b> testa a conexão antes de salvar.
                </li>
                <li>
                  <b>As analistas</b> inserem somente o código da vaga.
                </li>
                <li>
                  <b>O agente</b> importa os dados diretamente da Gupy.
                </li>
              </ol>
              <div className="privateBadge">
                <LockKeyhole size={17} /> Credencial nunca enviada ao navegador
                das analistas
              </div>
            </aside>
          </section>
        ) : (
          <>
            <section className="hero metallic-card">
              <div className="heroCopy">
                <span className="badge">
                  <Sparkles size={14} /> HUNTING INTELIGENTE
                </span>
                <h2>
                  Transforme uma vaga em uma{" "}
                  <em>estratégia de busca completa.</em>
                </h2>
                <p>
                  O agente expande títulos, competências, empresas e regiões,
                  cria buscas Boolean e X-Ray e ranqueia cada perfil com
                  evidências.
                </p>
                <button
                  className="primary"
                  onClick={() => setActive("Nova busca")}
                >
                  <Crosshair size={18} /> INICIAR NOVA BUSCA{" "}
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="radar">
                <div className="orbit o1" />
                <div className="orbit o2" />
                <div className="orbit o3" />
                <div className="eagle">
                  <Bird size={54} />
                </div>
                <i className="point p1" />
                <i className="point p2" />
                <i className="point p3" />
              </div>
            </section>
            <section className="stats">
              {stats.map(({ label, value, icon: Icon }) => (
                <article className="glass" key={label}>
                  <div className="icon">
                    <Icon size={21} />
                  </div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </section>
            <section className="grid">
              <article className="glass import">
                <div className="sectionTitle">
                  <div>
                    <span className="kicker">NOVA VAGA</span>
                    <h3>Como deseja inserir?</h3>
                  </div>
                  <ShieldCheck size={24} />
                </div>
                <div className="entryTabs">
                  <button className={jobEntryMode === "gupy" ? "active" : ""} onClick={() => { setJobEntryMode("gupy"); setMessage(""); }}>IMPORTAR DA GUPY</button>
                  <button className={jobEntryMode === "manual" ? "active" : ""} onClick={() => { setJobEntryMode("manual"); setMessage(""); }}>CADASTRAR MANUALMENTE</button>
                </div>
                {jobEntryMode === "gupy" ? (
                  <>
                    <p>Informe somente o código da vaga na Gupy.</p>
                    <div className="jobInput">
                      <input value={jobCode} onChange={(e) => setJobCode(e.target.value)} placeholder="Código da vaga" />
                      <button onClick={importJob} disabled={loading}>{loading ? "BUSCANDO..." : "IMPORTAR"} <Search size={17} /></button>
                    </div>
                  </>
                ) : (
                  <div className="manualJobForm">
                    <label><span>Título da vaga *</span><input value={manualJob.title} onChange={(e) => setManualJob({ ...manualJob, title: e.target.value })} placeholder="Ex.: Analista de Logística" /></label>
                    <label><span>Cidade *</span><input value={manualJob.city} onChange={(e) => setManualJob({ ...manualJob, city: e.target.value })} placeholder="Ex.: Barretos, SP" /></label>
                    <label className="full"><span>Descrição da vaga *</span><textarea value={manualJob.description} onChange={(e) => setManualJob({ ...manualJob, description: e.target.value })} placeholder="Cole ou escreva a descrição completa da vaga" rows={6} /></label>
                    <label className="full"><span>Palavras-chave</span><input value={manualJob.keywords} onChange={(e) => setManualJob({ ...manualJob, keywords: e.target.value })} placeholder="Separe por vírgulas: SAP, logística, indicadores" /></label>
                    <button className="primary full" onClick={saveManualJob}><BriefcaseBusiness size={18} /> SALVAR VAGA MANUAL</button>
                  </div>
                )}
                {message && <div className="notice">{message}</div>}
                <div className="safe">
                  <ShieldCheck size={16} /> Token protegido e visível apenas ao
                  administrador
                </div>
              </article>
              <article className="glass results">
                <div className="sectionTitle">
                  <div>
                    <span className="kicker">RADAR DE TALENTOS</span>
                    <h3>Melhores aderências</h3>
                  </div>
                  <button className="link">
                    Ver todos <ChevronRight size={16} />
                  </button>
                </div>
                <div className="emptyState">
                  <UsersRound size={38} />
                  <strong>Nenhum candidato mapeado</strong>
                  <span>Os resultados reais aparecerão aqui após iniciar uma busca.</span>
                </div>
              </article>
            </section>
          </>
        )}
        <footer>
          <span>Eureka · Minerva Talent Intelligence</span>
          <span>
            <span className="live" /> Sistema preparado
          </span>
        </footer>
      </section>
    </main>
  );
}
