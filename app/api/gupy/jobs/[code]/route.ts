import { NextResponse } from "next/server";
import { getGupyToken } from "@/lib/gupy-config";
import { findCountryCode, getCountryProfile } from "@/lib/geography";

type GupyJob = Record<string, unknown>;

function jobsFrom(payload: unknown): GupyJob[] {
  if (Array.isArray(payload)) return payload as GupyJob[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  for (const key of ["data", "results", "jobs"]) {
    if (Array.isArray(record[key])) return record[key] as GupyJob[];
  }
  return [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function richText(value: unknown) {
  return text(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeJob(job: GupyJob) {
  const city = text(job.addressCity);
  const state = text(job.addressStateShortName) || text(job.addressState);
  const rawCountry = text(job.addressCountryName)
    || text(job.addressCountry)
    || text(job.countryName)
    || text(job.country);
  const countryCode = findCountryCode(rawCountry, "BR");
  const country = getCountryProfile(countryCode).name;

  return {
    id: String(job.id ?? ""),
    code: String(job.code ?? job.id ?? ""),
    title: text(job.name) || text(job.title) || "Vaga sem título",
    city,
    state,
    country,
    countryCode,
    description: richText(job.description),
    responsibilities: richText(job.responsibilities),
    prerequisites: richText(job.prerequisites),
    additionalInformation: richText(job.additionalInformation),
    department: text(job.departmentName),
    role: text(job.roleName),
    status: text(job.status),
  };
}

async function requestJobs(base: string, token: string, filter: "id" | "code", value: string) {
  const url = new URL(`${base}/jobs`);
  url.searchParams.set(filter, value);
  url.searchParams.set("fields", "all");
  url.searchParams.set("perPage", "10");

  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).trim();
  if (!code || code.length > 255) {
    return NextResponse.json({ error: "Código de vaga inválido." }, { status: 400 });
  }

  try {
    const saved = await getGupyToken();
    if (!saved) {
      return NextResponse.json(
        { error: "Cadastre o token Gupy em Configurações." },
        { status: 503 },
      );
    }

    const base = process.env.GUPY_API_BASE_URL || "https://api.gupy.io/api/v1";
    const filters: Array<"id" | "code"> = /^\d+$/.test(code) ? ["id", "code"] : ["code"];

    for (const filter of filters) {
      const response = await requestJobs(base, saved.token, filter, code);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return NextResponse.json(
            { error: "O token não tem autorização para consultar vagas na Gupy." },
            { status: response.status },
          );
        }
        return NextResponse.json(
          { error: `Não foi possível consultar a Gupy (código ${response.status}).` },
          { status: response.status },
        );
      }

      const jobs = jobsFrom(payload);
      const exact = jobs.find((job) => String(job[filter] ?? "") === code) || jobs[0];
      if (exact) return NextResponse.json({ job: normalizeJob(exact) });
    }

    return NextResponse.json(
      { error: "Vaga não encontrada. Confira o ID ou o código da vaga na Gupy." },
      { status: 404 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}
