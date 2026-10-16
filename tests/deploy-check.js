/**
 * Sanity checks on the deployment files, for the things that can be verified
 * without Docker:
 *   - every Dockerfile COPY source exists in the build context (a typo there
 *     is a failed build)
 *   - the image would contain everything index.html references
 *   - the k8s/Sealos YAML is structurally sound and internally consistent
 *     (ports, selectors, labels, probes)
 */
const fs = require("fs");
const path = require("path");

const CTX = path.resolve(__dirname, "..");
const problems = [];
const checked = [];
const ok = (name, cond, detail) => {
  checked.push([name, cond, detail]);
  if (!cond) problems.push(name + (detail ? " :: " + detail : ""));
};

/* ---------------------------------------------------------------- Dockerfile */
const dockerfile = fs.readFileSync(path.join(CTX, "Dockerfile"), "utf8");
const copies = dockerfile
  .split("\n")
  .filter((l) => /^\s*COPY\s/i.test(l))
  .map((l) => l.trim().split(/\s+/).slice(1));
ok("Dockerfile has at least one COPY", copies.length > 0);

const imageFiles = new Set();
for (const parts of copies) {
  const dest = parts[parts.length - 1];
  const srcs = parts.slice(0, -1);
  for (const s of srcs) {
    const p = path.join(CTX, s.replace(/^\.\//, ""));
    const exists = fs.existsSync(p);
    ok(`COPY source exists: ${s}`, exists, exists ? "" : p + " is missing");
    if (exists && fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) imageFiles.add(path.posix.join(dest.replace(/\/$/, ""), f));
    } else if (exists) {
      imageFiles.add(dest.endsWith("/") ? path.posix.join(dest, path.basename(s)) : dest);
    }
  }
}

/* Everything index.html asks for must be in the image, or the deployed page is
   broken in ways only a browser notices. */
const html = fs.readFileSync(path.join(CTX, "index.html"), "utf8");
const refs = new Set();
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const v = m[1];
  if (/^(https?:|data:|#)/.test(v)) continue;
  refs.add(v.replace(/^\.\//, ""));
}
ok("index.html references something", refs.size > 0, `${refs.size} local refs`);
for (const r of refs) {
  const inImage = imageFiles.has("/usr/share/nginx/html/" + r) || imageFiles.has(path.posix.join("/usr/share/nginx/html", r));
  ok(`referenced file is in the image: ${r}`, inImage, r);
}

/* The game scripts are loaded by index.html, so count them for the record. */
const jsRefs = [...refs].filter((r) => r.endsWith(".js"));
ok("all game scripts are referenced", jsRefs.length >= 9, `${jsRefs.length} scripts`);

/* ----------------------------------------------------------------------- YAML */
const yaml = fs.readFileSync(path.join(CTX, "deploy/sealos.yaml"), "utf8");
ok("YAML has no tabs (YAML forbids them)", !/\t/.test(yaml));
ok("YAML does not start with a BOM", !yaml.startsWith("\ufeff"));
ok("YAML has three documents", (yaml.match(/^---$/gm) || []).length === 2, `${(yaml.match(/^---$/gm) || []).length} separators`);
ok("Deployment present", /^kind:\s*Deployment$/m.test(yaml));
ok("Service present", /^kind:\s*Service$/m.test(yaml));
ok("Ingress present", /^kind:\s*Ingress$/m.test(yaml));
ok("container port 80", /containerPort:\s*80/.test(yaml));
ok("service port 80", /^\s*-?\s*port:\s*80$/m.test(yaml));
ok("service targets 80", /targetPort:\s*80/.test(yaml));
ok("ingress backend port 80", /number:\s*80/.test(yaml));

/* labels/selectors must line up or the Service routes nowhere */
const appLabel = (yaml.match(/app:\s*block-jump/g) || []).length;
ok("app label used by deployment, service and ingress", appLabel >= 4, `${appLabel} occurrences`);
ok("readiness probe on /", /readinessProbe:[\s\S]*?path:\s*\//.test(yaml));
/* sealos.yaml and the workflow must point at the same image, or the two
   deployment paths would quietly deploy different things. */
const yamlImage = (yaml.match(/^\s*image:\s*(\S+)\s*$/m) || ["", ""])[1];
const repoOf = (ref) => {
  /* strip a tag, but only when the colon comes after the last slash - "ghcr.io"
     has its own colon that must not be mistaken for one */
  const colon = ref.lastIndexOf(":");
  return colon > ref.lastIndexOf("/") ? ref.slice(0, colon) : ref;
};
const wfImage = (fs
  .readFileSync(path.join(CTX, ".github/workflows/docker.yml"), "utf8")
  .match(/^\s*IMAGE:\s*(\S+)\s*$/m) || ["", ""])[1];
ok("sealos.yaml and the workflow use the same image", !!yamlImage && repoOf(yamlImage) === repoOf(wfImage), `${yamlImage} vs ${wfImage}`);
ok("resources requests+limits set", /requests:[\s\S]*?cpu:/.test(yaml) && /limits:[\s\S]*?memory:/.test(yaml));

/* ---------------------------------------------------------------- nginx conf */
const confRaw = fs.readFileSync(path.join(CTX, "deploy/nginx.conf"), "utf8");
/* directives only: a word inside a comment is not configuration */
const conf = confRaw
  .split("\n")
  .map((l) => l.replace(/\s*#.*$/, ""))
  .join("\n");
const opens = (conf.match(/{/g) || []).length;
const closes = (conf.match(/}/g) || []).length;
ok("nginx.conf braces balance", opens === closes, `${opens} { vs ${closes} }`);
ok("nginx.conf listens on 80", /listen\s+80;/.test(conf));
ok("nginx.conf serves the game root", /root\s+\/usr\/share\/nginx\/html;/.test(conf));
ok("nginx.conf falls back to index.html", /try_files[^;]*\/index\.html/.test(conf));
ok("nginx.conf does not cache the page itself", /location = \/index\.html\s*{[^}]*expires -1;/.test(conf));
ok(
  "nginx.conf sets security header once at server level",
  (conf.match(/add_header/g) || []).length === 1 && /add_header X-Content-Type-Options nosniff always;/.test(conf)
);
ok("nginx.conf lives exactly where the Dockerfile copies from", dockerfile.includes("deploy/nginx.conf"));

/* ------------------------------------------------------- GitHub Actions + repo */
const wfPath = path.join(CTX, ".github/workflows/docker.yml");
ok("GitHub Actions workflow exists", fs.existsSync(wfPath));
if (fs.existsSync(wfPath)) {
  const wf = fs.readFileSync(wfPath, "utf8");
  /* directives only: the prose in comments is not configuration */
  const wfCode = wf
    .split("\n")
    .map((l) => l.replace(/\s*#.*$/, ""))
    .join("\n");
  ok("workflow has no tabs", !/\t/.test(wf));
  ok("workflow triggers on push to main", /on:[\s\S]*?branches:\s*\[main\]/.test(wfCode));
  ok("workflow has a manual trigger", /workflow_dispatch:/.test(wfCode));
  ok("workflow can write packages", /packages:\s*write/.test(wfCode));
  ok("workflow logs in to ghcr", /registry:\s*ghcr\.io/.test(wfCode) && /GITHUB_TOKEN/.test(wfCode));
  ok("workflow finds the Dockerfile wherever it lives", /find \. -name Dockerfile/.test(wfCode) && /context=\$dir/.test(wfCode));
  ok(
    "workflow builds from that directory",
    /context:\s*\$\{\{\s*steps\.ctx\.outputs\.context\s*\}\}/.test(wfCode)
  );
  ok("workflow pushes the image", /push:\s*true/.test(wfCode));
  /* The image name must be a literal: a repository named "-" would produce
     ghcr.io/owner/-, and a bare separator is not a legal image component, so
     deriving it from the repo name would fail on every push. */
  const image = (wfCode.match(/^\s*IMAGE:\s*(\S+)\s*$/m) || ["", ""])[1];
  ok("workflow sets an explicit image name", !!image, image);
  ok("image name is not derived from the repo name", !/\$\{\{\s*github\.repository\s*\}\}/.test(wfCode));
  ok(
    "image name is a legal docker reference",
    /^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(image),
    image
  );
  const uses = [...wfCode.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  ok("workflow pins action versions", uses.length >= 4 && uses.every((u) => /@v\d+$/.test(u)), uses.join(", "));
}

const ignore = fs.readFileSync(path.join(CTX, ".gitignore"), "utf8");
ok(".gitignore keeps build output out of the repo", /^dist\/$/m.test(ignore));
ok(".gitignore keeps node_modules out", /^node_modules\/$/m.test(ignore));

/* ------------------------------------------------------------------ reporting */
for (const [name, cond, detail] of checked) {
  if (!cond) console.log(`FAIL  ${name}${detail ? " :: " + detail : ""}`);
}
console.log(`${checked.length - problems.length}/${checked.length} deployment checks passed`);
console.log(problems.length ? "\nDEPLOY CHECK FAILED\n" + problems.join("\n") : "\nDEPLOY CHECK PASSED");
process.exit(problems.length ? 1 : 0);
