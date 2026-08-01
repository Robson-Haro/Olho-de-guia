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
  const [searchStatus, setSearchStatus] = useState<"idle" | "working" | "completed" | "error">("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchStrategies, setSearchStrategies] = useState<SearchStrategy[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
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
  }
  async function startSearch() {
    if (!jobForm.title.trim() || !jobForm.description.trim() || (!jobForm.nationwide && !jobForm.city.trim())) {
      setSearchStatus("error");
      setSearchMessage("Preencha o título, a descrição e a cidade antes de buscar.");
      return;
    }
    setSearchStatus("working");
    setSearchMessage("Montando as buscas Boolean e X-Ray...");
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a busca.");
      setSearchStrategies(data.strategies);
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      setSelectedState("");
      setSelectedCity("");
      setSearchStatus("completed");
      setSearchMessage(`Busca concluída. ${data.strategies.length} estratégias foram geradas${data.candidates?.length ? ` e ${data.candidates.length} perfis foram encontrados` : ". Ainda não há uma fonte automática de perfis conectada"}.`);
      localStorage.setItem("eureka_active_search", JSON.stringify({ ...jobForm, strategies: data.strategies, createdAt: new Date().toISOString() }));
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
                  <button className={`primary full searchButton ${searchStatus === "completed" ? "activated" : ""}`} onClick={startSearch} disabled={searchStatus === "working"}>
                    {searchStatus === "completed" ? <CheckCircle2 size={21} /> : <Crosshair size={21} />}
                    {searchStatus === "working" ? "BUSCANDO TALENTOS..." : searchStatus === "completed" ? "BUSCA CONCLUÍDA" : "INICIAR BUSCA DE TALENTOS"}
                  </button>
                  {searchMessage && <div className={`searchSignal full ${searchStatus}`}><span className="signalDot" />{searchMessage}</div>}
                </div>
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
                {searchStrategies.length ? <div className="strategyList">
                  {searchStrategies.map((strategy) => <a key={strategy.label} href={strategy.url} target="_blank" rel="noreferrer"><div><strong>{strategy.label}</strong><span>{strategy.query}</span></div><ChevronRight size={20} /></a>)}
                </div> : <div className="emptyState"><UsersRound size={38} /><strong>Nenhuma busca ativada</strong><span>Preencha a vaga e clique no botão de busca para gerar as estratégias reais.</span></div>}
              </article>
            </section>
            {searchStatus === "completed" && (
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
