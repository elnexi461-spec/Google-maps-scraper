const $ = (s, el=document) => el.querySelector(s);
const view = $("#view");
let pollTimer = null;

const api = (u, opts) => fetch(u, opts).then(r => {
  if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail || r.statusText)));
  return r.json();
});
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = t => t ? new Date(t*1000).toLocaleString() : "—";
const statusBadge = st => `<span class="badge ${st}">${st}</span>`;

function scoreClass(s){ return s>=85?"good":s>=70?"mid":"bad"; }

// ---------- shell ----------
const titles = {new:"New Lead Job", jobs:"Job History", results:"Results", status:"System Status"};
function route(){
  clearInterval(pollTimer); pollTimer = null;
  const page = (location.hash.replace("#/","") || "new").split("?")[0];
  document.querySelectorAll("[data-nav]").forEach(a =>
    a.classList.toggle("active", a.dataset.nav === page));
  $("#pageTitle").textContent = titles[page] || "LeadForge";
  closeMenu();
  ({new: renderNew, jobs: renderJobs, results: renderResults, status: renderStatus}[page] || renderNew)();
}
window.addEventListener("hashchange", route);
const closeMenu = () => { $("#sidebar").classList.remove("open"); $("#overlay").classList.remove("show"); };
$("#hamburger").onclick = () => { $("#sidebar").classList.add("open"); $("#overlay").classList.add("show"); };
$("#overlay").onclick = closeMenu;

async function loadProviderBadge(){
  const s = await api("/api/status");
  $("#providerBadge").innerHTML = s.config.omkar.configured
    ? `<span class="dot ok"></span> Provider: Omkar`
    : `<span class="dot warn"></span> Provider: Mock (Omkar not configured)`;
}

// ---------- New job ----------
function renderNew(){
  view.innerHTML = `
  <div class="card">
    <h2>Create lead-generation job</h2>
    <form id="jobForm">
      <div class="grid2">
        <div><label>Business niche / category *</label>
          <input name="niche" required placeholder="e.g. Plumber, Dentist, Restaurant"/></div>
        <div><label>Location *</label>
          <input name="location" required placeholder="e.g. Austin, TX"/></div>
      </div>
      <label>Optional keywords (comma-separated)</label>
      <input name="keywords" placeholder="e.g. emergency, 24 hour, family owned"/>
      <div class="grid2">
        <div><label>Minimum rating</label>
          <select name="min_rating"><option value="">Any</option>
            <option>3.5</option><option>4</option><option>4.5</option></select></div>
        <div><label>Must have phone</label>
          <select name="has_phone"><option value="">Any</option>
            <option value="yes">Yes</option></select></div>
      </div>
      <div style="margin-top:20px"><button class="btn" type="submit">Start scraping →</button></div>
    </form>
  </div>
  <div class="card" id="activeJobs"><h2>Active jobs</h2><p class="muted">None running.</p></div>`;
  $("#jobForm").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const filters = {};
    if (f.get("min_rating")) filters.min_rating = parseFloat(f.get("min_rating"));
    if (f.get("has_phone")) filters.has_phone = true;
    try {
      const job = await api("/api/jobs", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({niche:f.get("niche"), location:f.get("location"),
                              keywords:f.get("keywords"), filters})});
      location.hash = `#/results?job=${job.id}`;
    } catch(err){ alert("Could not create job: " + err.message); }
  };
  const tick = async () => {
    const {jobs} = await api("/api/jobs?status=running&page_size=10");
    const active = jobs.concat((await api("/api/jobs?status=queued&page_size=10")).jobs,
                               (await api("/api/jobs?status=retrying&page_size=10")).jobs);
    $("#activeJobs").innerHTML = "<h2>Active jobs</h2>" + (active.length
      ? active.map(j => jobRow(j)).join("") : '<p class="muted">None running.</p>');
  };
  tick(); pollTimer = setInterval(tick, 2000);
}
const jobRow = j => `
  <div style="display:flex;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
    <div style="flex:1;min-width:0"><b>${esc(j.niche)}</b> <span class="muted">in</span> ${esc(j.location)}
      <div class="muted" style="font-size:12px">#${j.id} · ${j.unique_results} unique · ${j.clean_results} clean</div></div>
    ${statusBadge(j.status)}
    <div class="progress" style="width:120px"><div style="width:${j.progress_pct}%"></div></div>
    <a class="btn small ghost" href="#/results?job=${j.id}">Open</a>
  </div>`;

// ---------- Jobs history ----------
let jobsPage = 1;
async function renderJobs(){
  view.innerHTML = `
  <div class="card"><div class="toolbar">
    <div><label>Search</label><input id="jq" placeholder="niche or location"/></div>
    <div><label>Status</label><select id="jst"><option value="">All</option>
      <option>completed</option><option>partial</option><option>failed</option>
      <option>running</option><option>queued</option><option>retrying</option></select></div>
    <div style="flex:0"><button class="btn" id="jsearch">Filter</button></div>
  </div><div id="jobsTable"></div><div class="pager" id="jobsPager"></div></div>`;
  const load = async () => {
    const q = encodeURIComponent($("#jq").value), st = $("#jst").value;
    const data = await api(`/api/jobs?q=${q}&status=${st}&page=${jobsPage}&page_size=15`);
    $("#jobsTable").innerHTML = data.jobs.length ? `<table><thead><tr>
      <th>#</th><th>Niche</th><th>Location</th><th>Status</th><th>Progress</th>
      <th>Unique</th><th>Clean</th><th>Incomplete</th><th>Retries</th><th>Created</th><th></th>
      </tr></thead><tbody>${data.jobs.map(j => `<tr>
      <td>${j.id}</td><td>${esc(j.niche)}</td><td>${esc(j.location)}</td><td>${statusBadge(j.status)}</td>
      <td><div class="progress"><div style="width:${j.progress_pct}%"></div></div></td>
      <td>${j.unique_results}</td><td>${j.clean_results}</td><td>${j.incomplete_results}</td>
      <td>${j.retry_count}</td><td class="muted">${fmtTime(j.created_at)}</td>
      <td><a class="btn small ghost" href="#/results?job=${j.id}">Results</a>
          ${["failed","partial"].includes(j.status) ? `<button class="btn small" data-resume="${j.id}">Resume</button>`:""}
      </td></tr>`).join("")}</tbody></table>`
      : '<p class="muted">No jobs yet. Create one from “New Job”.</p>';
    const pages = Math.max(1, Math.ceil(data.total / 15));
    $("#jobsPager").innerHTML = `
      <button class="btn small ghost" id="jprev" ${jobsPage<=1?"disabled":""}>‹ Prev</button>
      Page ${jobsPage} / ${pages}
      <button class="btn small ghost" id="jnext" ${jobsPage>=pages?"disabled":""}>Next ›</button>`;
    $("#jprev").onclick = () => { jobsPage--; load(); };
    $("#jnext").onclick = () => { jobsPage++; load(); };
    document.querySelectorAll("[data-resume]").forEach(b => b.onclick = async () => {
      await api(`/api/jobs/${b.dataset.resume}/resume`, {method:"POST"}); load();
    });
  };
  $("#jsearch").onclick = () => { jobsPage = 1; load(); };
  load();
  pollTimer = setInterval(load, 4000);
}

// ---------- Results ----------
let rState = {job:null, page:1};
async function renderResults(){
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  if (params.get("job")) rState.job = params.get("job");
  const {jobs} = await api("/api/jobs?page_size=100");
  if (!rState.job && jobs.length) rState.job = jobs[0].id;
  view.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <div><label>Job</label><select id="rjob">
        ${jobs.map(j => `<option value="${j.id}" ${j.id==rState.job?"selected":""}>#${j.id} — ${esc(j.niche)} in ${esc(j.location)} (${j.status})</option>`).join("")}
      </select></div>
      <div><label>Search</label><input id="rq" placeholder="name, phone, address, website…"/></div>
      <div><label>Completeness</label><select id="rc">
        <option value="all">All</option><option value="clean">Clean only</option>
        <option value="incomplete">Incomplete only</option></select></div>
      <div><label>Phone</label><select id="rp">
        <option value="">Any</option><option value="yes">Has phone</option><option value="no">Missing phone</option></select></div>
      <div><label>Min rating</label><input id="rr" type="number" min="0" max="5" step="0.1" placeholder="0"/></div>
      <div style="flex:0"><button class="btn" id="rgo">Apply</button></div>
      <div style="flex:0"><a class="btn ghost" style="display:inline-block;text-decoration:none"
        id="rexport" href="#">Export CSV</a></div>
    </div>
    <div id="rstats"></div>
    <div id="rwrap" style="overflow-x:auto"></div>
    <div class="pager" id="rpager"></div>
  </div>`;
  $("#rjob").onchange = e => { rState.job = e.target.value; rState.page = 1; loadResults(); };
  $("#rgo").onclick = () => { rState.page = 1; loadResults(); };
  const loadResults = async () => {
    if (!rState.job) { $("#rwrap").innerHTML = '<p class="muted">No jobs yet.</p>'; return; }
    const u = new URLSearchParams({q:$("#rq").value, completeness:$("#rc").value,
      has_phone:$("#rp").value, min_rating:$("#rr").value, page:rState.page, page_size:20});
    $("#rexport").href = `/api/jobs/${rState.job}/export.csv?completeness=${$("#rc").value}`;
    const [data, job] = await Promise.all([
      api(`/api/jobs/${rState.job}/results?${u}`), api(`/api/jobs/${rState.job}`)]);
    $("#rstats").innerHTML = `<div class="stat-grid">
      <div class="stat"><div class="num">${job.unique_results}</div><div class="lbl">Unique leads</div></div>
      <div class="stat"><div class="num">${job.clean_results}</div><div class="lbl">Clean</div></div>
      <div class="stat"><div class="num">${job.incomplete_results}</div><div class="lbl">Incomplete</div></div>
      <div class="stat"><div class="num">${job.duplicate_records}</div><div class="lbl">Duplicates removed</div></div>
      <div class="stat"><div class="num">${job.retry_count}</div><div class="lbl">Retry events</div></div>
    </div>` + (job.error ? `<p style="color:var(--bad)">Error: ${esc(job.error)}</p>` : "");
    $("#rwrap").innerHTML = data.results.length ? `<table><thead><tr>
      <th>Name</th><th>Phone</th><th>Website</th><th>Rating</th><th>Address</th>
      <th>Score</th><th>Status</th></tr></thead><tbody>
      ${data.results.map(r => `<tr>
        <td><b>${esc(r.name)}</b><br><span class="muted" style="font-size:11px">${esc(r.category||"")}</span></td>
        <td>${esc(r.phone||"—")}</td>
        <td>${r.website ? `<a href="${esc(r.website)}" target="_blank" style="color:var(--accent)">link</a>` : "—"}</td>
        <td>${r.rating ?? "—"} ${r.reviews_count!=null ? `<span class="muted">(${r.reviews_count})</span>`:""}</td>
        <td>${esc(r.address||"—")}</td>
        <td><span class="score ${scoreClass(r.completeness_score)}">${r.completeness_score}</span></td>
        <td>${r.is_incomplete
          ? `<span class="badge partial" title="Missing: ${esc(r.missing_fields.join(", "))}">incomplete</span>`
          : `<span class="badge completed">clean</span>`}</td>
      </tr>`).join("")}</tbody></table>`
      : '<p class="muted">No results match.</p>';
    const pages = Math.max(1, Math.ceil(data.total / 20));
    $("#rpager").innerHTML = `
      <button class="btn small ghost" id="rprev" ${rState.page<=1?"disabled":""}>‹ Prev</button>
      Page ${rState.page} / ${pages} (${data.total} leads)
      <button class="btn small ghost" id="rnext" ${rState.page>=pages?"disabled":""}>Next ›</button>`;
    $("#rprev").onclick = () => { rState.page--; loadResults(); };
    $("#rnext").onclick = () => { rState.page++; loadResults(); };
  };
  loadResults();
  pollTimer = setInterval(() => {
    api(`/api/jobs/${rState.job}`).then(j => {
      if (["running","queued","retrying"].includes(j.status)) loadResults();
    }).catch(()=>{});
  }, 4000);
}

// ---------- Status ----------
async function renderStatus(){
  const s = await api("/api/status");
  const c = s.config;
  view.innerHTML = `
  <div class="card"><h2>Integration health</h2>
    <div class="health"><span class="dot ${s.ok?"ok":"bad"}"></span>
      Database: <b>${esc(s.database)}</b></div>
    <div class="health"><span class="dot ${c.provider==="omkar"?"ok":"warn"}"></span>
      Active provider: <b>${esc(c.provider)}</b>
      ${c.provider==="mock" ? `<span class="muted">— set OMKAR_API_URL / OMKAR_API_TOKEN / OMKAR_SCRAPER_NAME to connect the real extractor</span>`:""}</div>
    ${c.provider==="omkar" ? `<div class="health"><span class="dot ok"></span>
      Scraper: <b>${esc(c.omkar.scraper_name)}</b> · endpoint path <code>${esc(c.omkar.api_path)}</code></div>` : `
    <div class="health"><span class="dot ${c.omkar.api_url_set?"ok":"bad"}"></span> OMKAR_API_URL set</div>
    <div class="health"><span class="dot ${c.omkar.api_token_set?"ok":"bad"}"></span> OMKAR_API_TOKEN set</div>
    <div class="health"><span class="dot ${c.omkar.scraper_name_set?"ok":"bad"}"></span> OMKAR_SCRAPER_NAME set</div>`}
    <p class="muted" style="margin-top:14px;font-size:12px">Secret values are never displayed or transmitted to the browser.</p>
  </div>
  <div class="card"><h2>Pipeline statistics</h2>
    <div class="stat-grid">
      <div class="stat"><div class="num">${s.counts.jobs??0}</div><div class="lbl">Jobs</div></div>
      <div class="stat"><div class="num">${s.counts.results??0}</div><div class="lbl">Clean result rows</div></div>
      <div class="stat"><div class="num">${s.counts.raw_records??0}</div><div class="lbl">Raw records stored</div></div>
      <div class="stat"><div class="num">${s.counts.retry_pending??0}</div><div class="lbl">Retries pending</div></div>
      <div class="stat"><div class="num">${s.counts.retry_exhausted??0}</div><div class="lbl">Retries exhausted</div></div>
      <div class="stat"><div class="num">${s.counts.errors??0}</div><div class="lbl">Error log entries</div></div>
    </div>
    <p class="muted" style="font-size:12px">Incomplete threshold: ${c.completeness_incomplete_threshold}/100 ·
    retry policy: ${c.retry.max_attempts} attempts, ${c.retry.base_delay_seconds}s base backoff</p>
  </div>`;
}

loadProviderBadge();
route();
                                                                                           
