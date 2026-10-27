/**
 * End-to-end generate flow checks (library + HTTP).
 * Run: npx tsx --env-file=.env.local scripts/e2e-generate-flow.ts
 */
import { createHmac } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Pool } from "pg";
import { generateCoverLetterFile } from "../lib/generate/cover-letter.js";
import { generateResumeFile } from "../lib/generate/resume.js";

type Result = { ok: boolean; name: string; detail?: string };
const results: Result[] = [];

function pass(name: string, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, err: unknown) {
  const detail =
    err instanceof Error ? err.stack || err.message : String(err);
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name}\n${detail}`);
}

const root = process.cwd();
const profileData = JSON.parse(
  readFileSync(path.join(root, "data/seed-profiles/Elvis_Edinge.json"), "utf8"),
);

const jd = `
Senior Site Reliability Engineer — Acme Cloud (Remote)

We are hiring a remote Senior SRE to own Kubernetes reliability, Terraform IaC,
CI/CD with Jenkins/GitHub Actions, observability with Prometheus/Grafana, and
AWS production operations. Must have strong incident response and SLO practice.
Fully remote US.
`.trim();

function bullets(n: number, prefix: string) {
  return Array.from({ length: n }, (_, i) =>
    `${prefix} achievement ${i + 1}: delivered measurable reliability and automation impact using Kubernetes, Terraform, and AWS across production platforms.`,
  );
}

const fakeResumeJson = {
  title: "Senior Site Reliability Engineer",
  summary:
    "Senior Site Reliability Engineer with deep experience in Kubernetes, Terraform, Jenkins CI/CD, Prometheus, Grafana, and AWS production operations. Proven incident response, SLO ownership, and automation leadership across large-scale cloud platforms.",
  skills: {
    "Cloud & Platform": ["AWS", "Kubernetes", "Terraform", "IaaS"],
    DevOps: ["Jenkins", "GitHub Actions", "CI/CD", "Docker"],
    Observability: ["Prometheus", "Grafana", "SLO", "Incident Response"],
    Collaboration: ["Cross-functional leadership", "On-call", "Postmortems"],
  },
  experience: (profileData.experience as Array<{ title: string; company: string }>).map(
    (job, idx) => ({
      title: job.title,
      company: job.company,
      details: bullets(idx < 3 ? 6 : 4, `${job.company}`),
    }),
  ),
  certifications: [] as string[],
};

const coverLetter = [
  "Dear Hiring Manager,",
  "",
  "I am writing to apply for the Senior Site Reliability Engineer role at Acme Cloud. I bring hands-on Kubernetes, Terraform, CI/CD, and AWS production experience with strong SLO and incident response practice.",
  "",
  "At JPMorganChase and Capital One I led reliability automation, observability, and platform operations that improved availability and reduced toil.",
  "",
  "I would welcome the chance to discuss how I can support Acme Cloud's remote SRE goals.",
  "",
  "Sincerely,",
  "Elvis Edinge",
].join("\n");

const outDir = path.join(root, "tmp-e2e");
mkdirSync(outDir, { recursive: true });

async function httpPromptCheck() {
  const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
  const probe = await fetch(`${base}/api/generate`);
  if (probe.status !== 401 && probe.status !== 200) {
    throw new Error(`server not reachable: ${probe.status}`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const userRes = await pool.query<{ id: string; session_version: number }>(
      `SELECT id, session_version FROM users WHERE active = true ORDER BY created_at ASC LIMIT 1`,
    );
    const user = userRes.rows[0];
    if (!user) throw new Error("no active user in DB");

    const profiles = await pool.query<{ id: string; label: string | null }>(
      `SELECT id, COALESCE(data->>'name', id::text) AS label
       FROM resume_profiles
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT 5`,
    );
    const profile = profiles.rows[0];
    if (!profile) throw new Error("no resume profile in DB");

    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET missing");
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        v: user.session_version,
        exp: Date.now() + 60 * 60 * 1000,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");
    const token = `${payload}.${signature}`;

    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `applyra_session=${token}`,
      },
      body: JSON.stringify({
        kind: "resume",
        profileId: profile.id,
        jd,
        companyName: "Acme Cloud",
        targetRole: "Senior Site Reliability Engineer",
        jobLink: "https://example.com/jobs/sre-e2e-test",
        provider: "chatgpt",
        format: "pdf",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      result?: { mode?: string; prompt?: string };
      error?: string;
    };
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    }
    if (body.result?.mode !== "prompt" || !body.result?.prompt) {
      throw new Error(`unexpected body: ${JSON.stringify(body).slice(0, 400)}`);
    }
    pass(
      "HTTP /api/generate chatgpt prompt",
      `profile=${profile.label || profile.id} prompt=${body.result.prompt.length} chars`,
    );

    // PDF via queued generate with pasted ChatGPT JSON
    const pdfRes = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `applyra_session=${token}`,
      },
      body: JSON.stringify({
        kind: "resume",
        profileId: profile.id,
        jd,
        companyName: "Acme Cloud E2E",
        targetRole: "Senior Site Reliability Engineer",
        jobLink: `https://example.com/jobs/sre-e2e-pdf-${Date.now()}`,
        provider: "chatgpt",
        format: "pdf",
        pastedResponse: JSON.stringify(fakeResumeJson),
      }),
    });
    const pdfBody = (await pdfRes.json().catch(() => ({}))) as {
      jobId?: string;
      job?: { id?: string; status?: string; error?: string };
      error?: string;
      result?: { mode?: string; filename?: string; base64?: string };
    };
    if (!pdfRes.ok && pdfRes.status !== 202) {
      throw new Error(`PDF enqueue HTTP ${pdfRes.status}: ${JSON.stringify(pdfBody)}`);
    }

    // Fast path might return inline; otherwise poll job
    if (pdfBody.result?.mode === "file" && pdfBody.result.base64) {
      const buf = Buffer.from(pdfBody.result.base64, "base64");
      if (buf.slice(0, 4).toString() !== "%PDF") {
        throw new Error(`inline result not PDF: ${buf.slice(0, 8).toString("hex")}`);
      }
      writeFileSync(path.join(outDir, pdfBody.result.filename || "inline.pdf"), buf);
      pass("HTTP resume PDF export", `${pdfBody.result.filename} ${buf.length} bytes`);
      return;
    }

    const jobId = pdfBody.jobId || pdfBody.job?.id;
    if (!jobId) {
      throw new Error(`no jobId for PDF: ${JSON.stringify(pdfBody).slice(0, 400)}`);
    }

    let finished: {
      status?: string;
      error?: string;
      result?: { mode?: string; filename?: string; base64?: string; mimeType?: string };
    } | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const poll = await fetch(`${base}/api/generate?jobId=${jobId}`, {
        headers: { cookie: `applyra_session=${token}` },
      });
      const pollBody = (await poll.json()) as { job?: typeof finished };
      finished = pollBody.job || null;
      if (
        finished &&
        (finished.status === "finished" || finished.status === "failed")
      ) {
        break;
      }
    }
    if (!finished || finished.status !== "finished") {
      throw new Error(
        `PDF job did not finish: ${JSON.stringify(finished).slice(0, 500)}`,
      );
    }
    const file = finished.result;
    if (!file?.base64 || !String(file.filename || "").endsWith(".pdf")) {
      throw new Error(`PDF job missing file: ${JSON.stringify(file).slice(0, 300)}`);
    }
    const buf = Buffer.from(file.base64, "base64");
    if (buf.slice(0, 4).toString() !== "%PDF") {
      throw new Error(`job result not PDF: ${buf.slice(0, 8).toString("hex")}`);
    }
    writeFileSync(path.join(outDir, file.filename!), buf);
    pass("HTTP resume PDF export", `${file.filename} ${buf.length} bytes`);

    // Cover letter PDF via queue
    const clRes = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `applyra_session=${token}`,
      },
      body: JSON.stringify({
        kind: "cover-letter",
        profileId: profile.id,
        jd,
        companyName: "Acme Cloud E2E",
        targetRole: "Senior Site Reliability Engineer",
        jobLink: `https://example.com/jobs/sre-e2e-cl-${Date.now()}`,
        provider: "chatgpt",
        format: "pdf",
        pastedResponse: coverLetter,
      }),
    });
    const clBody = (await clRes.json().catch(() => ({}))) as {
      jobId?: string;
      job?: { id?: string };
      error?: string;
    };
    if (!clRes.ok && clRes.status !== 202) {
      throw new Error(`CL PDF enqueue HTTP ${clRes.status}: ${JSON.stringify(clBody)}`);
    }
    const clJobId = clBody.jobId || clBody.job?.id;
    if (!clJobId) throw new Error(`no cover jobId: ${JSON.stringify(clBody).slice(0, 300)}`);
    let clFinished: {
      status?: string;
      error?: string;
      result?: { mode?: string; filename?: string; base64?: string };
    } | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const poll = await fetch(`${base}/api/generate?jobId=${clJobId}`, {
        headers: { cookie: `applyra_session=${token}` },
      });
      const pollBody = (await poll.json()) as { job?: typeof clFinished };
      clFinished = pollBody.job || null;
      if (
        clFinished &&
        (clFinished.status === "finished" || clFinished.status === "failed")
      ) {
        break;
      }
    }
    if (!clFinished || clFinished.status !== "finished") {
      throw new Error(
        `cover PDF job did not finish: ${JSON.stringify(clFinished).slice(0, 500)}`,
      );
    }
    const clFile = clFinished.result;
    if (!clFile?.base64 || !String(clFile.filename || "").endsWith(".pdf")) {
      throw new Error(`cover PDF missing file: ${JSON.stringify(clFile).slice(0, 300)}`);
    }
    const clBuf = Buffer.from(clFile.base64, "base64");
    if (clBuf.slice(0, 4).toString() !== "%PDF") {
      throw new Error(`cover result not PDF: ${clBuf.slice(0, 8).toString("hex")}`);
    }
    writeFileSync(path.join(outDir, clFile.filename!), clBuf);
    pass("HTTP cover-letter PDF export", `${clFile.filename} ${clBuf.length} bytes`);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log("=== Applyra generate flow e2e ===\n");

  try {
    const r = await generateResumeFile({
      profileData,
      jd,
      companyName: "Acme Cloud",
      targetRole: "Senior Site Reliability Engineer",
      provider: "chatgpt",
      format: "pdf",
    });
    if (r.mode !== "prompt" || !String(r.prompt || "").trim()) {
      throw new Error(`expected prompt, got ${JSON.stringify({ mode: r.mode })}`);
    }
    pass("chatgpt resume prompt", `${r.prompt!.length} chars`);
    writeFileSync(path.join(outDir, "resume-prompt.txt"), r.prompt!);
  } catch (e) {
    fail("chatgpt resume prompt", e);
  }

  try {
    const r = await generateCoverLetterFile({
      profileData,
      jd,
      companyName: "Acme Cloud",
      targetRole: "Senior Site Reliability Engineer",
      provider: "chatgpt",
      format: "pdf",
    });
    if (r.mode !== "prompt" || String(r.prompt || "").length < 200) {
      throw new Error(`expected prompt, got mode=${r.mode}`);
    }
    pass("chatgpt cover-letter prompt", `${r.prompt!.length} chars`);
  } catch (e) {
    fail("chatgpt cover-letter prompt", e);
  }

  try {
    const r = await generateResumeFile({
      profileData,
      jd,
      companyName: "Acme Cloud",
      targetRole: "Senior Site Reliability Engineer",
      provider: "chatgpt",
      format: "docx",
      pastedResponse: JSON.stringify(fakeResumeJson),
    });
    if (r.mode !== "file" || !r.base64 || !String(r.filename).endsWith(".docx")) {
      throw new Error(`bad docx: ${JSON.stringify({ mode: r.mode, filename: r.filename })}`);
    }
    const buf = Buffer.from(r.base64, "base64");
    if (buf.length < 1000) throw new Error(`docx too small: ${buf.length}`);
    writeFileSync(path.join(outDir, r.filename!), buf);
    pass("resume DOCX export", `${r.filename} ${buf.length} bytes`);
  } catch (e) {
    fail("resume DOCX export", e);
  }

  try {
    const r = await generateCoverLetterFile({
      profileData,
      jd,
      companyName: "Acme Cloud",
      targetRole: "Senior Site Reliability Engineer",
      provider: "chatgpt",
      format: "docx",
      pastedResponse: coverLetter,
    });
    if (r.mode !== "file" || !r.base64 || !String(r.filename).endsWith(".docx")) {
      throw new Error(`bad cover docx: ${JSON.stringify({ mode: r.mode, filename: r.filename })}`);
    }
    const buf = Buffer.from(r.base64, "base64");
    writeFileSync(path.join(outDir, r.filename!), buf);
    pass("cover-letter DOCX export", `${r.filename} ${buf.length} bytes`);
  } catch (e) {
    fail("cover-letter DOCX export", e);
  }

  // PDF templates use JSX in .js — exercised through the Next /api/generate path below.
  try {
    await httpPromptCheck();
  } catch (e) {
    fail("HTTP /api/generate flows", e);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n=== ${results.length - failed.length}/${results.length} passed ===`,
  );
  if (failed.length) {
    console.log("Failed:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
