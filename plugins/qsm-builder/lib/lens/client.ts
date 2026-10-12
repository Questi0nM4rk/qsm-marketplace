// Scripts only the served page carries. They read no marketplace file: they fetch the page again.

/** One event stream from the server: a change redraws the sheet and keeps every open editor. */
export const LIVE_SCRIPT = `
(function(){
  var busy=false, again=false;
  function swap(html){
    var next=new DOMParser().parseFromString(html,"text/html").querySelector(".sheet");
    var cur=document.querySelector(".sheet");
    if(!next||!cur){return;}
    var kept={};
    [].forEach.call(cur.querySelectorAll("[data-key].editing"),function(w){
      var ed=w.querySelector(".pen-edit");
      if(ed){kept[w.getAttribute("data-key")]=ed;}
    });
    var y=scrollY,act=document.activeElement,sel="a[href],button,summary,input,select,textarea";
    var held=act&&act.closest&&act.closest(".pen-edit"),at=act&&cur.contains(act)?[].indexOf.call(cur.querySelectorAll(sel),act):-1;
    var name=act&&(act.getAttribute("aria-label")||act.textContent);
    cur.innerHTML=next.innerHTML;
    [].forEach.call(cur.querySelectorAll("[data-key]"),function(w){
      var ed=kept[w.getAttribute("data-key")];
      if(ed){w.classList.add("editing");w.appendChild(ed);var menu=w.closest("details");if(menu){menu.open=true;}}
    });
    window.qsmShow();scrollTo(0,y);
    var back=held&&cur.contains(act)?act:at>=0?cur.querySelectorAll(sel)[at]:null;
    if(back&&(back===act||(back.getAttribute("aria-label")||back.textContent)===name)){back.focus({preventScroll:true});}
  }
  // A redraw that fails says so on the page: the person must not read a stale page as current.
  function stale(e){
    var w=document.getElementById("live-fail")||document.body.appendChild(document.createElement("p"));
    w.id="live-fail";w.setAttribute("role","alert");w.className="pen-toast live-fail";
    w.textContent="Live update failed ("+(e&&e.message?e.message:"unknown")+"). This page may be stale; reload it.";
  }
  function refresh(){
    if(busy){again=true;return;}
    busy=true;
    fetch("/",{cache:"no-store"}).then(function(r){return r.text();}).then(swap).then(function(){var w=document.getElementById("live-fail");if(w){w.remove();}}).catch(stale).then(function(){
      busy=false;if(again){again=false;refresh();}
    });
  }
  var es=new EventSource("/events"),opened=false;
  es.onmessage=refresh;
  es.onopen=function(){if(opened){refresh();}opened=true;};
})();
`;

/**
 * The pen: a text with `data-pen` (its edit spec, JSON) turns into its control, a note box, save
 * and cancel. Save posts the edit to the server, which makes one task; no file is written. An
 * open editor keeps its own copy of the spec, so a redraw while it is open changes nothing in it.
 */
export const PEN_SCRIPT = `
(function(){
  function el(tag,cls,text){var e=document.createElement(tag);if(cls){e.className=cls;}if(text!==undefined){e.textContent=text;}return e;}
  function control(f){
    var c;
    if(f.control==="select"){
      c=el("select");
      (f.options||[]).forEach(function(o){var op=el("option",null,o);op.value=o;c.appendChild(op);});
    }else if(f.control==="input"){c=el("input");c.type="text";}
    else{c=el("textarea",f.control==="long"?"long":"");}
    c.value=f.value;
    return c;
  }
  function labelled(text,c,hint){var l=el("label",null,text);l.appendChild(c);if(hint){l.appendChild(el("span","hint",hint));}return l;}
  var toasts=el("div","pen-toasts");toasts.setAttribute("role","status");document.body.appendChild(toasts);
  function dismiss(){toasts.textContent="";}
  function toast(text){
    dismiss();
    var t=el("div","pen-toast"),x=el("button","pen-toast-x","\u00d7");
    t.appendChild(el("span",null,text));
    x.type="button";x.setAttribute("aria-label","Close");
    x.addEventListener("click",dismiss);t.appendChild(x);toasts.appendChild(t);
  }
  document.addEventListener("click",dismiss);
  document.addEventListener("keydown",function(e){if(e.key!=="Tab"){dismiss();}});
  function fill(spec,tpl,vals){
    spec.fields.forEach(function(f,i){tpl=tpl.split("{"+f.name+"}").join(vals[i]);});
    return tpl;
  }
  function words(spec,inputs){
    var out={};
    spec.fields.forEach(function(f,i){
      if(f.name==="name"||f.name==="description"||f.name==="triggers"){
        inputs[i].value.toLowerCase().split(/[^a-z0-9]+/).forEach(function(w){if(w.length>3){out[w]=1;}});
      }
    });
    return Object.keys(out);
  }
  function showMatches(box,ws){
    box.textContent="";
    var node=document.getElementById("lens-index");
    var index=node?JSON.parse(node.textContent):[];
    var hits=index.map(function(x){
      var hay=(x.name+" "+x.line).toLowerCase();
      return {x:x,n:ws.filter(function(w){return hay.indexOf(w)>=0;}).length};
    }).filter(function(h){return h.n>0;}).sort(function(a,b){return b.n-a.n;}).slice(0,6);
    if(ws.length===0){box.appendChild(el("p","hint","Type a name or a use case first."));return;}
    if(hits.length===0){box.appendChild(el("p","hint","Nothing here names those words. A new item looks justified."));return;}
    box.appendChild(el("p","hint","These already exist and use your words; read them before you start another."));
    hits.forEach(function(h){
      var a=el("a",null,h.x.name+" ("+h.x.kind+", "+h.n+" of "+ws.length+" words)");
      a.href="#"+h.x.route;box.appendChild(a);box.appendChild(el("br"));
    });
  }
  function close(wrap){
    var ed=wrap.querySelector(".pen-edit");
    if(ed){ed.remove();}
    wrap.classList.remove("editing");
    var opener=wrap.querySelector("[data-open]");
    if(opener){opener.focus();}
  }
  function open(wrap){
    if(wrap.classList.contains("editing")){return;}
    var spec=JSON.parse(wrap.getAttribute("data-pen"));
    var ed=el("div","pen-edit");
    var inputs=spec.fields.map(function(f){var c=control(f);ed.appendChild(labelled(f.label,c,f.hint));return c;});
    var note=el("textarea");note.placeholder="Why, or what you want instead";
    ed.appendChild(labelled("Note",note));
    var found=el("div","pen-found");
    if(spec.check){
      var look=el("button","cancel","Check whether this already exists");look.type="button";
      look.addEventListener("click",function(){showMatches(found,words(spec,inputs));});
      ed.appendChild(look);ed.appendChild(found);
    }
    var actions=el("div","pen-actions"),status=el("span","pen-status");
    status.setAttribute("role","status");
    ed.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();close(wrap);}});
    var save=el("button",null,"Save as a task"),cancel=el("button","cancel","Cancel");
    save.type="button";cancel.type="button";
    actions.appendChild(save);actions.appendChild(cancel);actions.appendChild(status);ed.appendChild(actions);
    cancel.addEventListener("click",function(){close(wrap);});
    save.addEventListener("click",function(){
      var join=function(vals){return spec.fields.length===1?vals[0]:spec.fields.map(function(f,i){return f.label+": "+vals[i];}).join("\\n");};
      var before=spec.fields.length===0?spec.before:join(spec.fields.map(function(f){return f.value;}));
      var after=spec.fields.length===0?spec.after:join(inputs.map(function(c){return c.value;}));
      if(spec.kind==="new"){
        var missing=spec.fields.filter(function(f,i){return f.required&&inputs[i].value.trim()==="";})[0];
        if(missing){status.textContent=missing.label+" is required; a new item also needs an eval case.";return;}
        before="";
      }else if(before===after&&note.value.trim()===""){status.textContent="Nothing changed and no note.";return;}
      save.disabled=true;status.textContent="Saving...";
      var edit={where:spec.where,file:spec.file,sha:spec.sha,section:spec.section,what:spec.what,before:before,after:after,note:note.value};
      if(spec.kind==="new"){
        var vals=inputs.map(function(c){return c.value.trim();});
        edit.kind="new";edit.where=fill(spec,spec.whereFrom||spec.where,vals);edit.file=fill(spec,spec.file,vals);
        edit.what=spec.what+" "+fill(spec,"{"+spec.titleField+"}",vals);
      }
      var saved=window.qsmSave?window.qsmSave(edit):fetch("/edit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(edit)});
      Promise.resolve(saved).then(function(r){return r instanceof Response?r.json().catch(function(){return {error:"HTTP "+r.status};}):r;}).then(function(j){
        if(j.error){save.disabled=false;status.textContent="Not saved: "+j.error;return;}
        close(wrap);toast(j.message||"Saved as task "+j.id+". No file was changed.");
      }).catch(function(e){save.disabled=false;status.textContent="Not saved: "+(e&&e.message?e.message:"the artifact database refused the write");});
    });
    wrap.classList.add("editing");wrap.appendChild(ed);
    var first=ed.querySelector("input,select,textarea");if(first){first.focus();}
  }
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest("[data-open]");
    if(b){var wrap=b.closest(".pen-wrap");if(wrap){open(wrap);}}
  });
})();
`;

/** The pencil on the pen button, drawn inline so nothing is fetched. */
export const PEN_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14l1-4 8-8 3 3-8 8z"/><path d="M9.5 3.5l3 3"/></svg>';

/**
 * The published page: when the artifact runtime answers with its database, the pens light up and
 * a saved edit is one row in `edits`, untaken, for `qsm-builder lens pull`. Opened from disk,
 * or by a viewer with no database, nothing here runs and the page stays read-only.
 */
export const ARTIFACT_SCRIPT = `
(function(){
  if(!window.claude||!window.claude.use){return;}
  window.claude.use("db").then(function(db){
    if(!db){return;}
    window.qsmSave=function(edit){
      var id=crypto.randomUUID();
      var row=Object.assign({},edit,{taken:false,savedAt:new Date().toISOString()});
      return db.doc("edits/"+id).set(row).then(function(){
        return {id:id,message:"Saved as edit "+id+" on the artifact. qsm-builder lens pull makes it a task. No file was changed."};
      });
    };
    document.documentElement.classList.add("db-ready");
  }).catch(function(){});
})();
`;
