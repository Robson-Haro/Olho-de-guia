'use client';
import { useMemo, useState } from 'react';
import { BarChart3, Bird, BriefcaseBusiness, ChevronRight, CircleUserRound, Crosshair, Database, Home, ListChecks, Search, Settings, ShieldCheck, Sparkles, Target, UsersRound, Zap } from 'lucide-react';

const candidates = [
  { name: 'Mariana Costa', role: 'Coordenadora de Logística', company: 'JBS', city: 'Campinas, SP', score: 94, skills: ['SAP', 'Inbound', 'Gestão'] },
  { name: 'Carlos Méndez', role: 'Supply Chain Manager', company: 'Sigma', city: 'Monterrey, MX', score: 89, skills: ['S&OP', 'Perecíveis', 'English'] },
  { name: 'Juliana Alves', role: 'Analista de Operações Sênior', company: 'BRF', city: 'Barretos, SP', score: 86, skills: ['Power BI', 'Outbound', 'Indicadores'] },
];

const nav = [{icon:Home,label:'Visão geral'},{icon:BriefcaseBusiness,label:'Vagas'},{icon:Crosshair,label:'Nova busca'},{icon:UsersRound,label:'Candidatos'},{icon:ListChecks,label:'Shortlist'},{icon:Database,label:'Banco de talentos'}];

export default function HomePage() {
  const [active,setActive]=useState('Visão geral');
  const [jobCode,setJobCode]=useState('');
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const stats=useMemo(()=>[{label:'Perfis mapeados',value:'1.284',change:'+18%',icon:UsersRound},{label:'Alta aderência',value:'327',change:'+12%',icon:Target},{label:'Shortlists ativas',value:'24',change:'+6',icon:ListChecks},{label:'Tempo economizado',value:'196h',change:'este mês',icon:Zap}],[]);
  async function importJob(){if(!jobCode.trim()){setMessage('Digite o código da vaga.');return;}setLoading(true);setMessage('');await new Promise(r=>setTimeout(r,900));setLoading(false);setMessage('Estrutura pronta. Conecte o token Gupy nas Configurações para importar a vaga '+jobCode+'.');}
  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark"><Bird size={30}/></div><div><strong>OLHO DE ÁGUIA</strong><span>TALENT HUNTER</span></div></div>
      <nav>{nav.map(({icon:Icon,label})=><button key={label} onClick={()=>setActive(label)} className={active===label?'active':''}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="navBottom"><button onClick={()=>setActive('Configurações')} className={active==='Configurações'?'active':''}><Settings size={19}/><span>Configurações</span><span className="admin">ADMIN</span></button><a href="https://robinho-minerva-foods1-muen.vercel.app/"><Home size={18}/> Portfólio</a></div>
    </aside>
    <section className="content">
      <header><div><p className="eyebrow">CENTRAL DE INTELIGÊNCIA</p><h1>{active}</h1><p>Encontre os talentos certos antes da concorrência.</p></div><div className="profile"><div className="statusDot"/><div><strong>Robson Ramos</strong><span>Administrador</span></div><CircleUserRound size={36}/></div></header>
      <section className="hero metallic-card"><div className="heroCopy"><span className="badge"><Sparkles size={14}/> HUNTING INTELIGENTE</span><h2>Transforme uma vaga em uma <em>estratégia de busca completa.</em></h2><p>O agente expande títulos, competências, empresas e regiões, cria buscas Boolean e X-Ray e ranqueia cada perfil com evidências.</p><button className="primary" onClick={()=>setActive('Nova busca')}><Crosshair size={18}/> INICIAR NOVA BUSCA <ChevronRight size={18}/></button></div><div className="radar"><div className="orbit o1"/><div className="orbit o2"/><div className="orbit o3"/><div className="eagle"><Bird size={54}/></div><i className="point p1"/><i className="point p2"/><i className="point p3"/></div></section>
      <section className="stats">{stats.map(({label,value,change,icon:Icon})=><article className="glass" key={label}><div className="icon"><Icon size={21}/></div><span>{label}</span><strong>{value}</strong><small>{change}</small></article>)}</section>
      <section className="grid">
        <article className="glass import"><div className="sectionTitle"><div><span className="kicker">INTEGRAÇÃO GUPY</span><h3>Importar uma vaga</h3></div><ShieldCheck size={24}/></div><p>Informe somente o código. O agente prepara os critérios e a estratégia.</p><div className="jobInput"><input value={jobCode} onChange={e=>setJobCode(e.target.value)} placeholder="Ex.: 12345678"/><button onClick={importJob} disabled={loading}>{loading?'BUSCANDO...':'IMPORTAR'} <Search size={17}/></button></div>{message&&<div className="notice">{message}</div>}<div className="safe"><ShieldCheck size={16}/> Token protegido e visível apenas ao administrador</div></article>
        <article className="glass results"><div className="sectionTitle"><div><span className="kicker">RADAR DE TALENTOS</span><h3>Melhores aderências</h3></div><button className="link">Ver todos <ChevronRight size={16}/></button></div>{candidates.map(c=><div className="candidate" key={c.name}><div className="avatar">{c.name.split(' ').map(n=>n[0]).slice(0,2)}</div><div className="person"><strong>{c.name}</strong><span>{c.role} · {c.company}</span><small>{c.city}</small><div>{c.skills.map(s=><b key={s}>{s}</b>)}</div></div><div className="score"><strong>{c.score}%</strong><span>aderência</span></div></div>)}</article>
      </section>
      <footer><span>Olho de Águia v0.1 · Minerva Talent Intelligence</span><span><span className="live"/> Sistema preparado</span></footer>
    </section>
  </main>;
}
