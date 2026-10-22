/* Personal Vault starter. Public Supabase project URL + publishable key only. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const CONFIG_KEY = "pv_public_config_v1";
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let supabase = null, session = null, mode = "signin", vaultPassphrase = null;
  let items = [], pendingRecoveryKey = null, activeKind = "note", toastTimer = null;

  const panels = ["setupPanel","authPanel","unlockPanel","recoveryPanel","vaultPanel"];
  function showPanel(id) { panels.forEach(p => $(p).classList.toggle("hidden", p !== id)); }
  function message(id, text, isError=true) { $(id).textContent = text || ""; $(id).style.color = isError ? "#b42318" : "#147d52"; }
  function toast(text) {
    $("toast").textContent = text; $("toast").classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2800);
  }
  function b64(bytes) { let s=""; bytes.forEach(x => s += String.fromCharCode(x)); return btoa(s); }
  function unb64(s) { const raw=atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
  function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b=randomBytes(16); b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128;
    const h=[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  function randomRecoveryKey() {
    // 32 bytes of cryptographically secure randomness, encoded as hex.
    return [...randomBytes(32)].map(x=>x.toString(16).padStart(2,"0")).join("");
  }
  async function deriveKey(passphrase, salt) {
    const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2", salt, iterations:310000, hash:"SHA-256"}, material,
      {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]);
  }
  async function encryptText(text, passphrase, saltB64) {
    const salt = saltB64 ? unb64(saltB64) : randomBytes(16);
    const iv = randomBytes(12), key = await deriveKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt({name:"AES-GCM",iv}, key, enc.encode(text));
    return {ciphertext:b64(new Uint8Array(ciphertext)),iv:b64(iv),salt:b64(salt)};
  }
  async function decryptText(record, passphrase) {
    const key = await deriveKey(passphrase, unb64(record.salt));
    const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(record.iv)}, key, unb64(record.ciphertext));
    return dec.decode(plain);
  }
  async function encryptBackupObject(obj, recoveryKey) {
    const salt=randomBytes(16), iv=randomBytes(12);
    const key=await deriveKey(recoveryKey, salt);
    const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(JSON.stringify(obj)));
    return {format:"personal-vault-backup",version:1,kdf:"PBKDF2-SHA-256",iterations:310000,
      cipher:"AES-256-GCM",salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ct)),createdAt:new Date().toISOString()};
  }
  async function decryptBackupObject(file, recoveryKey) {
    if (!file || file.format!=="personal-vault-backup" || file.version!==1 ||
        !file.salt || !file.iv || !file.ciphertext) throw new Error("Unsupported or invalid backup file.");
    const key=await deriveKey(recoveryKey,unb64(file.salt));
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(file.iv)},key,unb64(file.ciphertext));
    const parsed=JSON.parse(dec.decode(plain));
    if (!Array.isArray(parsed.items)) throw new Error("Backup data is invalid.");
    return parsed;
  }
  function downloadJson(obj, filename) {
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  function getConfig() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); } catch { return null; } }
  function saveConfig(url,key) { localStorage.setItem(CONFIG_KEY,JSON.stringify({url:url.replace(/\/+$/,""),key})); }
  function validConfig(c) { return c && /^https:\/\/[^/]+\.supabase\.co\/?$/.test(c.url) && typeof c.key==="string" && c.key.length>20; }
  function initClient(c) {
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase library did not load. Check your internet connection.");
    supabase=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    $("connection").textContent="Connected";
  }
  async function start() {
    try {
      
const c = {
  url: "https://ftqhiiwpeqqucdizouyh.supabase.co",
  key: "sb_publishable_GdxiQdTHvTsd2Juu6LO_Pg_bbm5iKMT"
};
      initClient(c);
      const {data,error}=await supabase.auth.getSession(); if(error) throw error;
      session=data.session;
      if(!session) showPanel("authPanel");
      else { $("userLabel").textContent=session.user.email || "Signed in"; showPanel("unlockPanel"); }
    } catch(e) { showPanel("setupPanel"); toast(e.message || "Could not initialize."); }
  }
  $("configForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const url=$("projectUrl").value.trim(), key=$("publishableKey").value.trim();
      if(!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)) throw new Error("Enter a valid Supabase project URL (https://….supabase.co).");
      if(key.length<20) throw new Error("Check the publishable/anon key.");
      saveConfig(url,key); await start();
    } catch(err) { toast(err.message); }
  });
  $("resetConfig").addEventListener("click",()=>{localStorage.removeItem(CONFIG_KEY);showPanel("setupPanel");});
  $("toggleAuth").addEventListener("click",()=>{
    mode=mode==="signin"?"signup":"signin";
    $("authTitle").textContent=mode==="signin"?"Welcome back":"Create your account";
    $("authSubmit").textContent=mode==="signin"?"Sign in":"Create account";
    $("accountPassword").autocomplete=mode==="signin"?"current-password":"new-password";
    $("toggleAuth").textContent=mode==="signin"?"Create an account":"I already have an account";
    message("authMessage","");
  });
  $("authForm").addEventListener("submit",async e=>{
    e.preventDefault(); message("authMessage","");
    try {
      const email=$("email").value.trim(), password=$("accountPassword").value;
      const result=mode==="signin" ? await supabase.auth.signInWithPassword({email,password}) : await supabase.auth.signUp({email,password});
      if(result.error) throw result.error;
      if(mode==="signup" && !result.data.session) { message("authMessage","Account created. Check your email to confirm, then sign in.",false); return; }
      session=result.data.session; $("userLabel").textContent=session?.user?.email || email; showPanel("unlockPanel");
    } catch(err) { message("authMessage",err.message || "Authentication failed."); }
  });

async function fetchRows() {
  const { data, error } = await supabase
    .from("vault_items")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = data || [];

  if (rows.length === 0) {
    throw new Error(
      "Vault not initialized. Create a new vault first."
    );
  }
  const checks = rows.filter(row => row.kind === "vault_check");
  const records = rows.filter(row => row.kind !== "vault_check");

  if (checks.length !== 1) {
    throw new Error(
      "Vault verification record is missing or invalid. Do not create another vault until you recover your data."
    );
  }

  try {
    const check = JSON.parse(
      await decryptText(checks[0], vaultPassphrase)
    );

    if (
      check.type !== "vault-verification" ||
      check.version !== 1
    ) {
      throw new Error("Invalid verification record.");
    }
  } catch {
    throw new Error("Wrong vault passphrase.");
  }

  const decrypted = [];

  for (const row of records) {
    try {
      const payload = JSON.parse(
        await decryptText(row, vaultPassphrase)
      );
      decrypted.push({ ...row, payload });
    } catch {
      throw new Error(
        "Could not decrypt vault data. Check the passphrase or stored data."
      );
    }
  }

  items = decrypted;
}
  async function pushItem(kind,payload,id) {
    const existing=items.find(x=>x.id===id);
    const sealed=await encryptText(JSON.stringify(payload),vaultPassphrase,existing?.salt);
    const row={id:id||randomId(),user_id:session.user.id,kind,ciphertext:sealed.ciphertext,iv:sealed.iv,salt:sealed.salt,updated_at:new Date().toISOString()};
    const {error}=await supabase.from("vault_items").upsert(row,{onConflict:"id"});
    if(error) throw error;
    await loadItems();
  }
  async function loadItems() {
    $("syncStatus").textContent="Syncing encrypted data…";
    await fetchRows(); renderLists(); $("syncStatus").textContent="Vault synced";
  }
  function safeText(tag,text,cls) { const el=document.createElement(tag); if(cls)el.className=cls; el.textContent=text||""; return el; }
  function makeItemCard(item,kind) {
    const card=document.createElement("article");card.className="vault-item";
    const info=document.createElement("div");
    info.appendChild(safeText("h3",item.payload.title));
    info.appendChild(safeText("p",kind==="note"?(item.payload.body||"").slice(0,100):(item.payload.website||item.payload.username||"Saved login")));
    const actions=document.createElement("div");actions.className="item-actions";
    const edit=document.createElement("button");edit.textContent="Edit";edit.addEventListener("click",()=>openEditor(kind,item));
    const del=document.createElement("button");del.textContent="Delete";del.addEventListener("click",()=>deleteItem(item.id));
    actions.append(edit,del);card.append(info,actions);return card;
  }
  function renderLists() {
    const notes=items.filter(x=>x.kind==="note"), creds=items.filter(x=>x.kind==="credential");
    $("notesList").replaceChildren(...notes.map(x=>makeItemCard(x,"note")));
    $("credentialsList").replaceChildren(...creds.map(x=>makeItemCard(x,"credential")));
    $("notesEmpty").classList.toggle("hidden",notes.length>0);
    $("credentialsEmpty").classList.toggle("hidden",creds.length>0);
  }
  function openEditor(kind,item=null) {
    activeKind=kind; $("itemId").value=item?.id||"";
    $("itemDialogTitle").textContent=(item?"Edit ":"New ")+(kind==="note"?"note":"login");
    $("noteFields").classList.toggle("hidden",kind!=="note");
    $("credentialFields").classList.toggle("hidden",kind!=="credential");
    $("itemTitle").value=item?.payload.title||"";
    $("itemBody").value=item?.payload.body||"";
    $("itemWebsite").value=item?.payload.website||"";
    $("itemUsername").value=item?.payload.username||"";
    $("itemSecret").value=item?.payload.secret||"";
    $("itemExtra").value=item?.payload.extra||"";
    $("itemDialog").showModal();
  }
  $("addNote").addEventListener("click",()=>openEditor("note"));
  $("addCredential").addEventListener("click",()=>openEditor("credential"));
  $("closeDialog").addEventListener("click",()=>$("itemDialog").close());
  $("cancelDialog").addEventListener("click",()=>$("itemDialog").close());
  $("itemForm").addEventListener("submit",async e=>{
    e.preventDefault();
    try {
      const title=$("itemTitle").value.trim(); if(!title)throw new Error("Enter a title.");
      const payload=activeKind==="note"?{title,body:$("itemBody").value}:{title,website:$("itemWebsite").value,username:$("itemUsername").value,secret:$("itemSecret").value,extra:$("itemExtra").value};
      await pushItem(activeKind,payload,$("itemId").value||null);$("itemDialog").close();toast("Saved encrypted.");
    }catch(err){toast(err.message||"Save failed.");}
  });
  async function deleteItem(id) {
    if(!confirm("Delete this item from your synced vault?"))return;
    const {error}=await supabase.from("vault_items").delete().eq("id",id);
    if(error){toast(error.message);return;}
    await loadItems();toast("Item deleted.");
  }
  function backupPayload() {
    return {format:"personal-vault-plaintext-inside-encrypted-envelope",version:1,items:items.map(x=>({id:x.id,kind:x.kind,ciphertext:x.ciphertext,iv:x.iv,salt:x.salt,created_at:x.created_at,updated_at:x.updated_at}))};
  }
  async function createBackup(key,download=true) {
    const encrypted=await encryptBackupObject(backupPayload(),key);
    if(download) downloadJson(encrypted,"personal-vault-backup-"+new Date().toISOString().slice(0,10)+".json");
    return encrypted;
  }
  $("newVault").addEventListener("click",async()=>{
    const pass=$("vaultPassphrase").value;
    if(pass.length<12){message("unlockMessage","Use a vault passphrase of at least 12 characters.");return;}
    try {
      const {data,error}=await supabase.from("vault_items").select("id").limit(1);if(error)throw error;
      if(data?.length) {message("unlockMessage","This account already has vault items. Unlock with the existing passphrase or restore a backup.");return;}
      vaultPassphrase=pass;pendingRecoveryKey=randomRecoveryKey();
      $("recoveryKeyText").textContent=pendingRecoveryKey;
      $("recoveryConfirmed").checked=false;$("finishRecovery").disabled=true;
      showPanel("recoveryPanel");
    }catch(err){message("unlockMessage",err.message||"Could not create vault.");}
  });
  $("recoveryConfirmed").addEventListener("change",()=>{$("finishRecovery").disabled=!$("recoveryConfirmed").checked;});
  $("copyRecovery").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(pendingRecoveryKey);toast("Recovery key copied. Store it safely.");}
    catch{toast("Clipboard unavailable. Select and copy the key manually.");}
  });
  $("downloadRecovery").addEventListener("click",async()=>{
    try{await createBackup(pendingRecoveryKey,true);toast("Encrypted backup downloaded.");}
    catch(e){toast(e.message||"Backup failed.");}
  });
  $("finishRecovery").addEventListener("click", async () => {
    if (!$("recoveryConfirmed").checked) return;

    try {
      if (!session?.user?.id) {
        throw new Error("Please sign in again before creating your vault.");
      }

      if (!pendingRecoveryKey || !vaultPassphrase) {
        throw new Error("Vault setup expired. Please start again.");
      }

      // Create an encrypted password-verification record.
      const marker = await encryptText(
        JSON.stringify({ type: "vault-verification", version: 1 }),
        vaultPassphrase
      );

      const row = {
        id: randomId(),
        user_id: session.user.id,
        kind: "vault_check",
        ciphertext: marker.ciphertext,
        iv: marker.iv,
        salt: marker.salt,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("vault_items")
        .insert(row);

      if (error) throw error;

      await createBackup(pendingRecoveryKey, true);
      pendingRecoveryKey = null;

      await loadItems();
      showPanel("vaultPanel");
      toast("Vault created. Save your recovery backup and key.");
    } catch (e) {
      toast(e.message || "Could not create vault.");
    }
  });
  $("unlockForm").addEventListener("submit",async e=>{
    e.preventDefault();message("unlockMessage","");
    try {
      const pass=$("vaultPassphrase").value;if(pass.length<12)throw new Error("Vault passphrase must be at least 12 characters.");
      vaultPassphrase=pass;await loadItems();showPanel("vaultPanel");$("vaultPassphrase").value="";
    }catch(err){vaultPassphrase=null;message("unlockMessage",err.message||"Could not unlock vault.");}
  });
  $("makeBackup").addEventListener("click",async()=>{
    try { const key=prompt("Enter a new recovery key (at least 20 characters). Store it separately from the backup."); if(!key)return;
      if(key.length<20)throw new Error("Use a longer recovery key.");
      await createBackup(key,true);message("backupMessage","Encrypted backup downloaded. Store the recovery key separately.",false);
    }catch(e){message("backupMessage",e.message||"Backup failed.");}
  });
  $("changeVaultPass").addEventListener("click",()=>toast("Passphrase rotation is not implemented in this starter. Do not change it without a tested re-encryption migration."));
  $("restoreVault").addEventListener("click",()=>$("restoreDialog").showModal());
  $("closeRestore").addEventListener("click",()=>$("restoreDialog").close());
  $("cancelRestore").addEventListener("click",()=>$("restoreDialog").close());
  $("restoreForm").addEventListener("submit",async e=>{
    e.preventDefault();message("restoreMessage","");
    try {
      const file=$("backupFile").files[0];if(!file)throw new Error("Choose a backup file.");
      const parsed=JSON.parse(await file.text());
      const restored=await decryptBackupObject(parsed,$("recoveryKeyInput").value);
      if(!confirm("This will replace all current vault records for this account. Continue?"))return;
      const {error:delError}=await supabase.from("vault_items").delete().neq("id","00000000-0000-0000-0000-000000000000");
      if(delError)throw delError;
      const rows=restored.items.map(x=>({id:x.id,user_id:session.user.id,kind:x.kind,ciphertext:x.ciphertext,iv:x.iv,salt:x.salt,created_at:x.created_at||new Date().toISOString(),updated_at:x.updated_at||new Date().toISOString()}));
      if(rows.length){const {error}=await supabase.from("vault_items").upsert(rows,{onConflict:"id"});if(error)throw error;}
      $("restoreDialog").close();toast("Backup restored. Unlock using the original vault passphrase.");showPanel("unlockPanel");
    }catch(err){message("restoreMessage",err.message||"Restore failed. Check file and recovery key.");}
  });
  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===btn));
    ["notes","passwords","backup"].forEach(t=>$(t+"Tab").classList.toggle("hidden",t!==btn.dataset.tab));
  }));
  $("lockButton").addEventListener("click",lockVault);
  function lockVault(){vaultPassphrase=null;items=[];$("notesList").replaceChildren();$("credentialsList").replaceChildren();if(session)showPanel("unlockPanel");}
  $("logoutButton").addEventListener("click",async()=>{
    lockVault();try{const {error}=await supabase.auth.signOut();if(error)throw error;session=null;showPanel("authPanel");toast("Signed out.");}
    catch(e){toast(e.message||"Sign out failed.");}
  });
  if(window.supabase) start();
  else { showPanel("setupPanel"); $("connection").textContent="Library unavailable"; }
})();
