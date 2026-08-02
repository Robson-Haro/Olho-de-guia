"use client";
import { useEffect, useState } from "react";
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
  MapPinned,
  LockKeyhole,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Zap,
} from "lucide-react";

type ImportedJob = {
  id: string;
  code: string;
  title: string;
  city: string;
  description: string;
  responsibilities: string;
  prerequisites: string;
  additionalInformation: string;
  department: string;
  role: string;
  status: string;
};

type SearchStrategy = {
  label: string;
  query: string;
  url: string;
};

type Candidate = {
  id: string;
  name: string;
  title: string;
  city: string;
  state: string;
  profileUrl?: string;
  company?: string;
  source?: string;
  summary?: string;
  compatibility: number;
  matchReason: string;
};

type ProviderSearchStatus = {
  provider: "serper";
  label: string;
  status: "success" | "error";
  count: number;
  message: string;
};

type TalentSourceStatus = {
  provider: "serper";
  label: string;
  configured: boolean;
  updatedAt: string | null;
};

type IntegrationState = {
  status: "idle" | "working" | "success" | "error";
  message: string;
};

const brazilStates = [
  ["AC",1,3],["AM",2,2],["RR",3,1],["RO",3,3],["PA",4,2],["AP",5,1],["TO",5,3],
  ["MA",6,2],["PI",7,3],["CE",8,2],["RN",9,2],["PB",9,3],["PE",8,3],["AL",9,4],["SE",8,4],["BA",7,4],
  ["MT",4,4],["MS",4,5],["GO",5,4],["DF",5,5],["MG",6,5],["ES",7,5],["RJ",7,6],["SP",6,6],
  ["PR",5,7],["SC",5,8],["RS",4,9],
] as const;

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
  const [importedJob, setImportedJob] = useState<ImportedJob | null>(null);
  const [jobEntryMode, setJobEntryMode] = useState<"gupy" | "manual">("gupy");
  const [jobForm, setJobForm] = useState({
    title: "",
    city: "",
    additionalCity: "",
    description: "",
    keywords: ["", "", "", ""],
    nationwide: false,
  });
  const [searchStatus, setSearchStatus] = useState<"idle" | "working" | "completed" | "empty" | "error">("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchStrategies, setSearchStrategies] = useState<SearchStrategy[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [providerResults, setProviderResults] = useState<ProviderSearchStatus[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [gupyToken, setGupyToken] = useState(""),
    [showToken, setShowToken] = useState(false),
    [configStatus, setConfigStatus] = useState<
      "idle" | "working" | "success" | "error"
    >("idle"),
    [configMessage, setConfigMessage] = useState("");
  const [talentKeys, setTalentKeys] = useState({ serper: "" });
  const [showTalentKeys, setShowTalentKeys] = useState({ serper: false });
  const [talentSourceStatus, setTalentSourceStatus] = useState<TalentSourceStatus[]>([]);
  const [talentIntegration, setTalentIntegration] = useState<Record<"serper", IntegrationState>>({
    serper: { status: "idle", message: "" },
  });
  const highAdherenceCount = candidates.filter((candidate) => candidate.compatibility >= 70).length;
  const stats = [
    { label: "Perfis mapeados", value: String(candidates.length), icon: UsersRound },
    { label: "Alta aderência", value: String(highAdherenceCount), icon: Target },
    { label: "Shortlists ativas", value: "0", icon: ListChecks },
    { label: "Tempo economizado", value: "0h", icon: Zap },
  ];
  useEffect(() => {
    if (active !== "Configurações") return;
    fetch("/api/admin/talent-source", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao consultar fontes.");
        setTalentSourceStatus(Array.isArray(data.sources) ? data.sources : []);
      })
      .catch(() => setTalentSourceStatus([]));
  }, [active]);
  async function importJob() {
    if (!jobCode.trim()) {
      setMessage("Digite o código da vaga.");
      return;
    }
    setLoading(true);
    setMessage("");
    setImportedJob(null);
    try {
      const response = await fetch(`/api/gupy/jobs/${jobCode.trim()}`),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível importar a vaga.");
      setImportedJob(data.job);
      setJobForm((current) => ({
        ...current,
        title: data.job.title || "",
        city: data.job.city || "",
        description: [
          data.job.description,
          data.job.responsibilities,
          data.job.prerequisites,
          data.job.additionalInformation,
        ].filter(Boolean).join("\n\n"),
      }));
      setMessage(`Vaga ${data.job.title} importada com sucesso.`);
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
  async function configureTalentSource(provider: "serper", action: "test" | "save") {
    const apiKey = talentKeys[provider].trim();
    if (!apiKey) {
      setTalentIntegration((current) => ({ ...current, [provider]: { status: "error", message: "Cole a chave da API para continuar." } }));
      return;
    }
    setTalentIntegration((current) => ({ ...current, [provider]: { status: "working", message: action === "save" ? "Testando e protegendo a chave..." : "Testando conexão..." } }));
    try {
      const response = await fetch("/api/admin/talent-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na configuração.");
      setTalentIntegration((current) => ({ ...current, [provider]: { status: "success", message: data.message } }));
      if (action === "save") {
        setTalentKeys((current) => ({ ...current, [provider]: "" }));
        const statusResponse = await fetch("/api/admin/talent-source", { cache: "no-store" });
        const statusData = await statusResponse.json();
        if (statusResponse.ok) setTalentSourceStatus(Array.isArray(statusData.sources) ? statusData.sources : []);
      }
    } catch (error) {
      setTalentIntegration((current) => ({ ...current, [provider]: { status: "error", message: error instanceof Error ? error.message : "Erro na configuração." } }));
    }
  }
  function updateKeyword(index: number, value: string) {
    setJobForm((current) => ({
      ...current,
      keywords: current.keywords.map((keyword, keywordIndex) => keywordIndex === index ? value : keyword),
    }));
  }
  function prepareManualJob() {
    setImportedJob(null);
    setJobForm({ title: "", city: "", additionalCity: "", description: "", keywords: ["", "", "", ""], nationwide: false });
    setMessage("Preencha os dados abaixo e inicie a busca.");
    setSearchStatus("idle");
    setSearchStrategies([]);
    setProviderResults([]);
  }
  async function startSearch() {
    if (!jobForm.title.trim() || !jobForm.description.trim() || (!jobForm.nationwide && !jobForm.city.trim())) {
      setSearchStatus("error");
      setSearchMessage("Preencha o título, a descrição e a cidade antes de buscar.");
      return;
    }
    setSearchStatus("working");
    setSearchMessage("Consultando o Google via Serper e localizando perfis públicos do LinkedIn...");
    setProviderResults([]);
    setCandidates([]);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobForm),
      });
      const data = await response.json();
      setSearchStrategies(Array.isArray(data.strategies) ? data.strategies : []);
      setProviderResults(Array.isArray(data.providers) ? data.providers : []);
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a busca.");
      const foundCandidates = Array.isArray(data.candidates) ? data.candidates : [];
      setCandidates(foundCandidates);
      setSelectedState("");
      setSelectedCity("");
      setSearchStatus(foundCandidates.length ? "completed" : "empty");
      setSearchMessage(foundCandidates.length
        ? `Busca concluída: ${foundCandidates.length} perfil(is) público(s) do LinkedIn encontrado(s) em 1 consulta Serper.`
        : "A consulta foi concluída, mas nenhum perfil público do LinkedIn correspondeu aos filtros. Tente ampliar o cargo, as palavras-chave ou a localização.");
      localStorage.setItem("eureka_active_search", JSON.stringify({ ...jobForm, strategies: data.strategies, candidates: foundCandidates, providers: data.providers, createdAt: new Date().toISOString() }));
    } catch (error) {
      setSearchStatus("error");
      setSearchMessage(error instanceof Error ? error.message : "Erro ao iniciar busca.");
    }
  }
  const stateTotals = candidates.reduce<Record<string, number>>((totals, candidate) => {
    totals[candidate.state] = (totals[candidate.state] || 0) + 1;
    return totals;
  }, {});
  const selectedStateCandidates = candidates.filter((candidate) => candidate.state === selectedState);
  const cityTotals = selectedStateCandidates.reduce<Record<string, number>>((totals, candidate) => {
    totals[candidate.city] = (totals[candidate.city] || 0) + 1;
    return totals;
  }, {});
  const visibleCandidates = selectedCity
    ? selectedStateCandidates.filter((candidate) => candidate.city === selectedCity)
    : selectedStateCandidates;
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
            <Home size={18} /> HOME
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
            <a
              className="homeShortcut"
              href="https://robinho-minerva-foods1-muen.vercel.app/"
              aria-label="Voltar para o Ecossistema de Talent Acquisition Estratégico"
            >
              <Home size={18} />
              <span>HOME</span>
            </a>
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
            <article className="glass settingsCard talentSourcesCard">
              <div className="sectionTitle">
                <div>
                  <span className="kicker">BUSCA AUTOMÁTICA REAL</span>
                  <h2>Fontes de talentos</h2>
                </div>
                <Database size={30} />
              </div>
              <p>
                Conecte o Serper para localizar perfis públicos do LinkedIn pelo
                Google. A chave é criptografada e usada apenas no servidor.
              </p>
              <div className="talentSourceList">
                {(["serper"] as const).map((provider) => {
                  const configured = talentSourceStatus.find((source) => source.provider === provider)?.configured;
                  const integration = talentIntegration[provider];
                  const label = "Serper · Busca LinkedIn";
                  return (
                    <section className="talentSource" key={provider}>
                      <div className="sourceHeading">
                        <div>
                          <strong>{label}</strong>
                          <span>Perfis públicos do LinkedIn indexados pelo Google</span>
                        </div>
                        <span className={`sourceBadge ${configured ? "connected" : ""}`}>
                          {configured ? "CONECTADA" : "NÃO CONFIGURADA"}
                        </span>
                      </div>
                      <label>
                        <span>Chave da API</span>
                        <div className="secureInput">
                          <ShieldCheck size={18} />
                          <input
                            type={showTalentKeys[provider] ? "text" : "password"}
                            value={talentKeys[provider]}
                            onChange={(event) => setTalentKeys((current) => ({ ...current, [provider]: event.target.value }))}
                            placeholder={`Cole a chave ${label}`}
                            autoComplete="off"
                          />
                          <button
                            onClick={() => setShowTalentKeys((current) => ({ ...current, [provider]: !current[provider] }))}
                            aria-label="Mostrar ou ocultar chave"
                          >
                            {showTalentKeys[provider] ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                      <small className="creditNote">
                        Cada busca ou teste usa 1 consulta do Serper. A conta nova inclui 2.500 consultas gratuitas, sem cartão. Nenhum enriquecimento é realizado.
                      </small>
                      <a className="providerHelpLink" href="https://serper.dev/" target="_blank" rel="noreferrer">
                        Criar conta ou consultar saldo no Serper
                      </a>
                      {integration.message && (
                        <div className={`configNotice ${integration.status}`}>
                          {integration.status === "success" ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                          <span>{integration.message}</span>
                        </div>
                      )}
                      <div className="configActions compactActions">
                        <button className="secondary" disabled={integration.status === "working"} onClick={() => configureTalentSource(provider, "test")}>TESTAR</button>
                        <button className={`primary ${configured ? "saved" : ""}`} disabled={integration.status === "working"} onClick={() => configureTalentSource(provider, "save")}>
                          <ShieldCheck size={18} />
                          {integration.status === "working" ? "PROCESSANDO..." : configured ? "ATUALIZAR CONEXÃO" : "SALVAR E ATIVAR"}
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
            </article>
            <aside className="glass setupGuide">
              <span className="kicker">STATUS DA INTEGRAÇÃO</span>
              <h3>Como funciona</h3>
              <ol>
                <li>
                  <b>Você</b> cadastra a chave do Serper nesta área protegida.
                </li>
                <li>
                  <b>O sistema</b> testa a conexão antes de salvar.
                </li>
                <li>
                  <b>As analistas</b> inserem somente o código da vaga.
                </li>
                <li>
                  <b>O agente</b> importa a vaga da Gupy, monta a busca X-Ray e consulta perfis públicos do LinkedIn.
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
                <div className="entryTabs topEntryTabs">
                  <button className={jobEntryMode === "gupy" ? "active" : ""} onClick={() => { setJobEntryMode("gupy"); setMessage(""); }}>USAR CÓDIGO DA GUPY</button>
                  <button className={jobEntryMode === "manual" ? "active" : ""} onClick={() => { setJobEntryMode("manual"); prepareManualJob(); }}>INSERIR MANUALMENTE</button>
                </div>
                {jobEntryMode === "gupy" && (
                  <div className="jobInput topJobInput">
                    <label className="jobCodeField">
                      <span>Número ou código da vaga Gupy *</span>
                      <input value={jobCode} onChange={(e) => setJobCode(e.target.value)} placeholder="Ex.: 12345678" inputMode="numeric" />
                    </label>
                    <button onClick={importJob} disabled={loading}>{loading ? "PUXANDO..." : "PUXAR VAGA"} <Search size={17} /></button>
                  </div>
                )}
                <div className="searchForm">
                  <label><span>Título da vaga *</span><input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} placeholder="Ex.: Analista de Logística" /></label>
                  <label className="full"><span>Descrição da vaga — revise e altere como desejar *</span><textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} placeholder="A descrição importada aparecerá aqui, ou você pode escrever manualmente" rows={9} /></label>
                  <fieldset className="full keywordFields"><legend>Palavras-chave para a busca</legend>
                    {jobForm.keywords.map((keyword, index) => <input key={index} value={keyword} onChange={(e) => updateKeyword(index, e.target.value)} placeholder={`Palavra-chave ${index + 1}`} />)}
                  </fieldset>
                  <label><span>Cidade da vaga *</span><input value={jobForm.city} onChange={(e) => setJobForm({ ...jobForm, city: e.target.value })} placeholder="Cidade importada ou principal" /></label>
                  <label><span>Acrescentar outra cidade</span><input value={jobForm.additionalCity} onChange={(e) => setJobForm({ ...jobForm, additionalCity: e.target.value })} placeholder="Opcional: região ou cidade adicional" /></label>
                  <label className="full nationwideToggle"><input type="checkbox" checked={jobForm.nationwide} onChange={(e) => setJobForm({ ...jobForm, nationwide: e.target.checked })} /><span><strong>Brasil inteiro — todas as cidades</strong><small>Use esta opção para mapear profissionais em qualquer localidade do país.</small></span></label>
                  <button className={`primary full searchButton ${searchStatus === "completed" ? "activated" : ""} ${searchStatus === "empty" ? "finishedEmpty" : ""}`} onClick={startSearch} disabled={searchStatus === "working"}>
                    {searchStatus === "completed" ? <CheckCircle2 size={21} /> : <Crosshair size={21} />}
                    {searchStatus === "working" ? "BUSCANDO TALENTOS..." : searchStatus === "completed" ? `BUSCA CONCLUÍDA · ${candidates.length} PERFIS` : searchStatus === "empty" ? "BUSCA FINALIZADA · 0 PERFIS" : "INICIAR BUSCA DE TALENTOS"}
                  </button>
                  {searchMessage && <div className={`searchSignal full ${searchStatus}`}><span className="signalDot" />{searchMessage}</div>}
                  {providerResults.length > 0 && <div className="providerRunList full">
                    {providerResults.map((provider) => <div key={provider.provider} className={provider.status}>
                      <span className="signalDot" />
                      <strong>{provider.label}</strong>
                      <span>{provider.message}</span>
                    </div>)}
                  </div>}
                </div>
                {message && <div className="notice">{message}</div>}
                <div className="safe">
                  <ShieldCheck size={16} /> 1 busca = 1 consulta Serper · chave protegida no servidor
                </div>
              </article>
              <article className="glass results">
                <div className="sectionTitle">
                  <div>
                    <span className="kicker">RADAR DE TALENTOS</span>
                    <h3>Perfis públicos encontrados</h3>
                  </div>
                  <button className="link">
                    Ver todos <ChevronRight size={16} />
                  </button>
                </div>
                {candidates.length > 0 ? <div className="candidateTableWrap">
                  <table className="candidateTable">
                    <thead>
                      <tr>
                        <th>Aderência</th>
                        <th>Nome</th>
                        <th>Cargo atual</th>
                        <th>Empresa</th>
                        <th>Localização</th>
                        <th>LinkedIn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((candidate) => (
                        <tr key={candidate.id}>
                          <td>
                            <span className={`compatibilityBadge ${candidate.compatibility >= 70 ? "high" : candidate.compatibility >= 45 ? "medium" : "low"}`}>
                              {candidate.compatibility}%
                            </span>
                            <small className="matchReason">{candidate.matchReason}</small>
                          </td>
                          <td>
                            <strong>{candidate.name}</strong>
                            {candidate.summary && <small className="candidateSnippet">{candidate.summary}</small>}
                          </td>
                          <td>{candidate.title || "Não identificado"}</td>
                          <td>{candidate.company || "Não identificada"}</td>
                          <td>{[candidate.city, candidate.state].filter(Boolean).join("/") || "Não identificada"}</td>
                          <td>
                            <a className="linkedinButton" href={candidate.profileUrl} target="_blank" rel="noreferrer">
                              ABRIR PERFIL <ChevronRight size={15} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="scoreDisclaimer">A aderência é uma estimativa baseada apenas no título e no trecho público indexado pelo Google. Confirme o perfil completo no LinkedIn antes de decidir.</p>
                </div> : <div className="emptyState"><UsersRound size={38} /><strong>{searchStatus === "working" ? "Busca em andamento" : searchStatus === "empty" ? "Busca finalizada sem perfis" : searchStatus === "error" ? "A busca automática não foi executada" : "Nenhuma busca ativada"}</strong><span>{searchStatus === "error" ? "Confira o aviso e conecte o Serper em Configurações." : "Preencha a vaga e consulte os perfis públicos pelo Serper."}</span></div>}
                {searchStrategies.length > 0 && <div className="manualSearches">
                  <span className="kicker">PESQUISA MANUAL COMPLEMENTAR</span>
                  <div className="strategyList">
                    {searchStrategies.map((strategy) => <a key={strategy.label} href={strategy.url} target="_blank" rel="noreferrer"><div><strong>{strategy.label}</strong><span>{strategy.query}</span></div><ChevronRight size={20} /></a>)}
                  </div>
                </div>}
              </article>
            </section>
            {candidates.length > 0 && (
              <section className="glass geoPanel">
                <div className="sectionTitle"><div><span className="kicker">INTELIGÊNCIA GEOGRÁFICA</span><h3>Mapa de talentos no Brasil</h3><p>{candidates.length ? `${candidates.length} perfis distribuídos por estado e cidade.` : "O mapa será preenchido quando uma fonte de perfis retornar candidatos reais."}</p></div><MapPinned size={30} /></div>
                <div className="geoGrid">
                  <div className="brazilMap" aria-label="Mapa interativo do Brasil">
                    {brazilStates.map(([state, column, row]) => {
                      const total = stateTotals[state] || 0;
                      const percentage = candidates.length ? Math.round((total / candidates.length) * 100) : 0;
                      return <button key={state} style={{gridColumn: column, gridRow: row}} className={`${total ? "hasTalent" : ""} ${selectedState === state ? "selected" : ""}`} onClick={() => { setSelectedState(state); setSelectedCity(""); }} title={`${state}: ${total} perfis (${percentage}%)`}><strong>{state}</strong>{total > 0 && <span>{total}<small>{percentage}%</small></span>}</button>;
                    })}
                  </div>
                  <div className="geoDetails">
                    {!selectedState ? <div className="emptyState"><MapPinned size={38}/><strong>Selecione um estado</strong><span>Clique no mapa para abrir as cidades e os perfis encontrados.</span></div> : <><h4>{selectedState} · {selectedStateCandidates.length} perfis</h4><div className="cityChips">{Object.entries(cityTotals).map(([city,total]) => <button key={city} className={selectedCity === city ? "active" : ""} onClick={() => setSelectedCity(city)}>{city}<span>{total}</span></button>)}</div>{!selectedStateCandidates.length ? <div className="emptyState compact"><UsersRound size={32}/><strong>Nenhum perfil real neste estado</strong><span>Não serão exibidos dados fictícios.</span></div> : <div className="profileList">{visibleCandidates.map((candidate) => <a key={candidate.id} href={candidate.profileUrl || "#"} target={candidate.profileUrl ? "_blank" : undefined} rel="noreferrer"><CircleUserRound size={30}/><span><strong>{candidate.name}</strong><small>{candidate.title} · {candidate.city}/{candidate.state}</small></span><ChevronRight size={18}/></a>)}</div>}</>}
                  </div>
                </div>
              </section>
            )}
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
