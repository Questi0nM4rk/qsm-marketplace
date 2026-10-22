// The look of the page: tokens and components from the approved design (dark pastel by default, a
// pastel light mode, one sheet on a dotted ground, sharp corners, 2px edges, hard soft shadows),
// and the inline script that switches tabs by hash and the theme.

const LIGHT = `--bg:#e9e4f3; --surface:#fdfcff; --raised:#f2eef9; --line:#ddd6ea;
  --text:#3b3848; --muted:#635e77; --heading:#2b2937;
  --lavender:#6554ad; --mint:#2f6b54; --peach:#8c523e; --sky:#38658b; --rose:#934965; --butter:#725f24;
  --lavender-bg:#e6defa; --mint-bg:#dcf1e7; --peach-bg:#f8e3d8; --sky-bg:#dde9f7; --rose-bg:#f7e0e8; --butter-bg:#f6ecc9;
  --edge:#c9bfdf; --shade:#d2c7e8; --dot:#d8cfea; --sheet:#f7f4fb; color-scheme:light`;

export const CSS = `
:root{
  --bg:#22212b; --surface:#2a2935; --raised:#312f3d; --line:#3d3b4b;
  --text:#d9d6e6; --muted:#a29fb5; --heading:#ebe8f5;
  --lavender:#b9aee6; --mint:#9fd4bf; --peach:#e8b9a0; --sky:#9cc3e3; --rose:#e3a9bd; --butter:#e6d59c;
  --lavender-bg:#363149; --mint-bg:#2c3a36; --peach-bg:#3d322f; --sky-bg:#2d3646; --rose-bg:#3d2f37; --butter-bg:#3a3629;
  --fs-12:12px; --dur:120ms; --fs-14:14px; --fs-16:16px; --fs-18:18px; --fs-20:20px;
  --serif:system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --sans:system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono",monospace;
  --radius:0; --edge:#45425a; --shade:#14131a; --dot:#2f2d3b; --sheet:#1d1c25; color-scheme:dark;
}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){
  ${LIGHT}}}
:root[data-theme="light"]{
  ${LIGHT}}

*{box-sizing:border-box}
body{margin:0;background:var(--bg);background-image:radial-gradient(var(--dot) 1.3px,transparent 1.5px);background-size:22px 22px;color:var(--text);font-family:var(--sans);font-size:var(--fs-16);line-height:1.6}
.sheet{max-width:960px;margin-block:48px 72px;margin-inline:auto;background:var(--sheet);border:2px solid var(--edge);box-shadow:10px 10px 0 var(--shade)}
@media(max-width:1000px){.sheet{margin-inline:16px}}
@media(max-width:520px){.sheet{margin-block:16px 40px;box-shadow:6px 6px 0 var(--shade)}}
main,.masthead{max-width:860px;margin:0 auto}
main{padding-inline:clamp(16px,5vw,48px)}
.sheet>.masthead{padding-block:44px 0;padding-inline:clamp(16px,5vw,48px)}
main{padding-block:40px 56px;display:flex;flex-direction:column;gap:40px;outline:none}
@media(max-width:520px){main{padding-inline:4px}.sheet>.masthead{padding-inline:4px}}
.skip{position:absolute;left:16px;top:-80px;z-index:20;background:var(--lavender-bg);color:var(--heading);border:2px solid var(--lavender);padding:6px 12px}
.skip:focus{top:8px}
a{color:var(--lavender)}
a:focus-visible,summary:focus-visible,button:focus-visible{outline:2px solid var(--lavender);outline-offset:3px}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--lavender);outline-offset:2px}
h2[tabindex]:focus:not(:focus-visible){outline:none}

.tab{display:flex;flex-direction:column;gap:40px}
.tab[hidden]{display:none}
.part{padding:8px 0 0}
.part p{color:var(--muted)}
.card{background:var(--surface);border:2px solid var(--edge);border-radius:0;box-shadow:6px 6px 0 var(--shade);padding:28px 28px 30px;min-width:0}
@media(max-width:520px){.card{padding:16px 10px 18px;box-shadow:3px 3px 0 var(--shade)}}
.card.soft{background:var(--mint-bg)}
.card.calm{background:var(--sky-bg)}

.eyebrow{display:block;font-family:var(--sans);font-size:var(--fs-14);font-weight:600;letter-spacing:.04em;color:var(--muted);margin-bottom:10px;overflow-wrap:anywhere}
.part .eyebrow{display:inline-block;color:var(--heading);background:var(--lavender-bg);border:2px solid var(--lavender);padding:4px 10px;box-shadow:3px 3px 0 var(--shade)}
h1,h2.title{font-family:var(--serif);font-weight:800;letter-spacing:-.02em;font-size:var(--fs-20);line-height:1.15;color:var(--heading);margin:0;text-wrap:balance;overflow-wrap:anywhere}
h1 em,h2 em{font-style:normal;color:var(--lavender)}
h3{font-family:var(--serif);font-weight:800;font-size:var(--fs-18);line-height:1.25;color:var(--heading);margin:0 0 14px;text-wrap:balance;overflow-wrap:anywhere}
h4{font-family:var(--sans);font-size:var(--fs-16);font-weight:600;margin:0;color:var(--heading)}
.ship{padding:14px 0;border-top:1px solid var(--line)}.ship:first-of-type{border-top:0;padding-top:0}
.ship h4{margin-bottom:6px;overflow-wrap:anywhere}
.ship .chips{margin-block:10px 12px}
p{margin:0 0 12px;max-width:65ch;overflow-wrap:anywhere}p:last-child{margin-bottom:0}
.part .site{font-family:var(--serif);font-weight:800;font-size:var(--fs-18);line-height:1.25;color:var(--heading);margin:0;text-wrap:balance}
.part .site em{font-style:normal;color:var(--lavender)}
.lede{font-size:var(--fs-16);color:var(--muted);margin-top:12px}
small{font-size:var(--fs-12)}
.dim{color:var(--muted)}
code{font-family:var(--mono);font-size:inherit;background:var(--raised);color:var(--text);padding:1px 6px;border-radius:0;overflow-wrap:anywhere}

.tabs{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;align-items:center}
.tabs a{font-family:var(--mono);font-size:var(--fs-14);text-decoration:none;color:var(--text);background:var(--surface);border:2px solid var(--edge);padding:4px 10px;box-shadow:3px 3px 0 var(--shade);overflow-wrap:anywhere}
.tabs a:hover{border-color:var(--lavender)}
.tabs a[aria-current="page"]{background:var(--lavender-bg);border-color:var(--lavender);color:var(--heading)}
.tabs.sub{margin-top:0}
@media(max-width:520px){.tabs{gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding:0 4px 8px 0}.tabs a{font-size:var(--fs-12);padding:3px 8px;white-space:nowrap;flex:none}}
.tabs small{color:var(--muted);font-size:var(--fs-12)}
.back{font-size:var(--fs-16);font-weight:500;align-self:flex-start}
.theme{font:inherit;font-size:var(--fs-14);font-weight:500;color:var(--heading);background:var(--lavender-bg);border:2px solid var(--lavender);padding:3px 12px;box-shadow:3px 3px 0 var(--shade);cursor:pointer;display:block;margin:12px 16px 0 auto;min-block-size:32px}
@media(min-width:1240px){.theme{position:fixed;top:12px;right:12px;margin:0;z-index:10}}

.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.trig{font-family:var(--mono);font-size:var(--fs-14);padding:1px 6px;background:var(--raised);color:var(--muted);cursor:text;overflow-wrap:anywhere}
.trig::before{content:"\\201C"}.trig::after{content:"\\201D"}
.tag{font-size:var(--fs-12);font-weight:600;padding:2px 10px;border-radius:0;background:var(--raised);color:var(--muted);display:inline-block;margin-right:6px}
.tag.fire{background:var(--rose-bg);color:var(--rose)}
.tag.scn{background:var(--butter-bg);color:var(--butter)}
.tag.skill{background:var(--mint-bg);color:var(--mint)}
.tag.agent{background:var(--peach-bg);color:var(--peach)}
.tag.k-node{background:var(--sky-bg);color:var(--sky);outline:3px solid var(--sky);outline-offset:-3px}
.tag.k-tool{background:var(--mint-bg);color:var(--mint)}
.tag.k-web{background:var(--butter-bg);color:var(--butter);outline:2px dashed var(--butter);outline-offset:-2px}
.tag.k-mcp{background:var(--peach-bg);color:var(--peach);outline:2px dotted var(--peach);outline-offset:-2px}
.tag.stale{background:var(--rose-bg);color:var(--rose)}

.tiles{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}
@media(max-width:640px){.tiles{grid-template-columns:1fr}}
.tile{background:var(--raised);border:2px solid var(--edge);border-top:4px solid var(--lavender);padding:16px 18px;min-width:0;box-shadow:4px 4px 0 var(--shade)}
.tile h4{font-family:var(--mono);font-size:var(--fs-16);font-weight:500;margin-bottom:8px;overflow-wrap:anywhere}
.tile h4 a{display:inline-block;min-block-size:24px}
.tile div{font-size:var(--fs-16);line-height:1.5;margin-top:6px;overflow-wrap:anywhere}
.tile div b{display:block;font-size:var(--fs-12);font-weight:600;color:var(--muted);letter-spacing:.03em}

.rows{margin-top:14px;border:2px solid var(--edge);background:var(--surface);overflow:hidden}
.card.calm .rows,.card.soft .rows{background:var(--bg)}
.rows .row{display:grid;grid-template-columns:190px 1fr;gap:14px;padding:12px 16px;border-bottom:1px solid var(--line);font-size:var(--fs-16);line-height:1.55}
.rows .row:last-child{border-bottom:none}
.rows .row b{font-size:var(--fs-14);font-weight:600;color:var(--muted);overflow-wrap:anywhere}
.rows .row>*{min-width:0;overflow-wrap:anywhere}
.rows .row b>a{display:inline-block;padding-block:4px}
@media(max-width:600px){.rows .row{grid-template-columns:1fr;gap:4px}}
.brick{margin-top:18px}
.item+.item{margin-top:28px;padding-top:24px;border-top:2px solid var(--line)}

.src{margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
.src:first-child{margin-top:0;padding-top:0;border-top:none}
.src-head{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;margin:0 0 8px;font-size:var(--fs-14);color:var(--muted)}
.src-head b{font-size:var(--fs-12);font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--heading)}
.kind{margin-top:24px}.kind:first-child{margin-top:8px}
.kind>h4{font-family:var(--serif);font-weight:800;font-size:var(--fs-16);color:var(--heading);margin-bottom:4px}
.kind>h4 small{font-family:var(--sans);font-size:var(--fs-14);color:var(--muted)}
.case{margin-top:14px;padding:16px 18px;background:var(--surface);border:2px solid var(--edge);box-shadow:3px 3px 0 var(--shade)}
@media(max-width:520px){.case{padding:12px}}
.case>header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.case h5{font-family:var(--sans);font-size:var(--fs-16);font-weight:600;line-height:1.35;color:var(--heading);margin:0;min-width:0;overflow-wrap:anywhere}
.case-name{margin:6px 0 12px;font-size:var(--fs-14);color:var(--muted)}
.kv{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;padding:10px 0;border-top:1px solid var(--line);font-size:var(--fs-16);line-height:1.55}
.kv>*{min-width:0;overflow-wrap:anywhere}
.kv .k{font-size:var(--fs-14);font-weight:600;color:var(--muted)}
@media(max-width:600px){.kv{grid-template-columns:1fr}}
.prompt{margin:0;white-space:pre-wrap;font-family:var(--mono);font-size:var(--fs-14);line-height:1.5;background:var(--raised);padding:10px 12px;border:1px solid var(--line)}
.grader{padding:8px 0}.grader+.grader{border-top:1px dashed var(--line)}
.g-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.g-head b{font-family:var(--mono);font-weight:500}
.how{margin:4px 0;color:var(--text)}
blockquote{margin:6px 0 0;padding:6px 12px;border-left:3px solid var(--lavender);color:var(--text)}
.result{margin-top:12px;padding:12px 14px;border:2px dashed var(--sky);background:var(--sky-bg)}
.result.met{border-color:var(--mint);background:var(--mint-bg)}
.result.unmet{border-color:var(--peach);background:var(--peach-bg)}
.result .k{display:block;font-size:var(--fs-12);font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--heading);margin-bottom:8px}
.result .k small{font-weight:400;letter-spacing:0;text-transform:none;color:var(--muted);margin-left:6px}
.result p{margin:0}
.stats{display:flex;flex-wrap:wrap;gap:8px 24px}
.stat small{display:block;font-size:var(--fs-12);color:var(--muted)}
.stat b{font-size:var(--fs-18);color:var(--heading)}
.row.child{padding-left:34px;background:var(--raised)}
.row.child>b::before{content:"\\2514 ";color:var(--muted)}

.flow{display:flex;flex-wrap:wrap;gap:10px;align-items:center;list-style:none;margin:14px 0 0;padding:0}
.flow li.s{background:var(--raised);border:2px solid var(--edge);box-shadow:3px 3px 0 var(--shade);padding:8px 12px;font-weight:600;font-size:var(--fs-14);color:var(--heading);min-width:0;overflow-wrap:anywhere;animation:beat 1.2s ease-in-out both}
.flow li.s.end{background:var(--lavender-bg)}
.flow li.a{color:var(--muted);font-size:var(--fs-18)}
@media(max-width:600px){.flow{flex-direction:column;align-items:flex-start;gap:4px}.flow li.a{transform:rotate(90deg);margin-left:16px}}
@keyframes beat{0%,100%{box-shadow:0 0 0 0 transparent}40%{box-shadow:0 0 0 2px var(--lavender)}}
.note{background:var(--raised);border:2px solid var(--edge);padding:12px 16px;font-size:var(--fs-16);margin-top:14px;max-width:none;color:var(--muted)}

figure{margin:16px 0 6px}
.fwrap{overflow-x:auto}
.fwrap:focus-visible{outline:2px solid var(--lavender);outline-offset:3px}
figure svg{width:100%;height:auto;display:block;background:var(--raised);border:2px solid var(--edge);box-shadow:4px 4px 0 var(--shade)}
figcaption{font-size:var(--fs-14);color:var(--muted);margin-top:10px;overflow-wrap:anywhere}
svg text{font-family:var(--mono);font-size:var(--fs-12);fill:var(--text)}
svg .node{fill:var(--sky-bg);stroke:var(--sky);stroke-width:3}
svg .part{fill:var(--raised);stroke:var(--muted);stroke-width:1.5}
svg a{cursor:pointer}
svg a:hover rect{stroke:var(--lavender);stroke-width:3.6}
svg .tool{fill:var(--mint-bg);stroke:var(--mint);stroke-width:2}
svg .web{fill:var(--butter-bg);stroke:var(--butter);stroke-width:2;stroke-dasharray:6 3}
svg .mcp{fill:var(--peach-bg);stroke:var(--peach);stroke-width:2;stroke-dasharray:2 3}
svg .hl{fill:var(--lavender-bg);stroke:var(--lavender);stroke-width:3}
svg text.on-hl{fill:var(--heading)}
svg .arr{stroke:var(--muted);stroke-width:1.2;fill:none}
svg .arr.dep{stroke:var(--lavender);stroke-width:2}
svg .arr.own{stroke:var(--muted);stroke-width:1;stroke-dasharray:4 3}
svg .ah{fill:var(--muted)}
svg .arr.off{display:none}
svg .dim{opacity:.25}
.pick{margin:0 0 18px;padding:14px 16px 16px;background:var(--raised);border:2px solid var(--edge);box-shadow:4px 4px 0 var(--shade)}
.pick-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:12px}
.pick-title{font-family:var(--sans);font-size:var(--fs-14);font-weight:600;color:var(--heading)}
.pick-count{font-family:var(--mono);font-size:var(--fs-12);color:var(--muted)}
.pick-acts{margin-left:auto;display:flex;gap:8px}
.pick-acts button{font-family:var(--sans);font-size:var(--fs-12);font-weight:600;color:var(--heading);background:var(--surface);border:2px solid var(--edge);padding:4px 10px;min-block-size:32px;cursor:pointer;box-shadow:2px 2px 0 var(--shade)}
.pick-acts button:hover{border-color:var(--lavender)}
.pick-acts button:active{transform:translate(2px,2px);box-shadow:none}
.pick-acts button:disabled{opacity:.45;cursor:default;box-shadow:none}
.pick-chips{display:flex;flex-wrap:wrap;gap:8px}
.pick-chip{position:relative;display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:var(--fs-12);padding:4px 10px;background:var(--surface);border:2px solid var(--edge);color:var(--muted);cursor:pointer;user-select:none;transition:background var(--dur),border-color var(--dur),color var(--dur)}
.pick-chip input{position:absolute;opacity:0;pointer-events:none}
.pick-chip::before{content:"";width:7px;height:7px;border:2px solid currentColor;transition:background var(--dur)}
.pick-chip:hover{border-color:var(--lavender)}
.pick-chip:has(input:checked){background:var(--lavender-bg);border-color:var(--lavender);color:var(--heading)}
.pick-chip:has(input:checked)::before{background:var(--lavender);border-color:var(--lavender)}
.pick-chip:has(input:focus-visible){outline:2px solid var(--lavender);outline-offset:2px}
svg .arr,svg [data-id]{transition:opacity var(--dur)}
svg.hot .arr{opacity:.12}
svg.hot .arr.lit{opacity:1;stroke:var(--lavender);stroke-width:2.4}
svg.hot [data-id].lit rect{stroke:var(--lavender);stroke-width:3.6}

details.note{padding:0;color:var(--text)}
summary{cursor:pointer;font-weight:600;font-size:var(--fs-16);padding:12px 16px;list-style:none;display:flex;justify-content:space-between;color:var(--heading)}
summary::after{content:"+";color:var(--muted)}details[open] summary::after{content:"-"}
summary::-webkit-details-marker{display:none}
details .rows{margin:0;border-top:1px solid var(--line);background:transparent}
@media(prefers-reduced-motion:reduce){:root{--dur:0.01ms}.flow li.s{animation:none}}
`;

export const SCRIPT = `
(function(){
  var root=document.documentElement;
  try{var saved=localStorage.getItem("theme"); if(saved){root.setAttribute("data-theme",saved);}}catch(e){}
  document.addEventListener("click",function(e){
    if(!e.target.closest||!e.target.closest("#theme")){return;}
    var cur=root.getAttribute("data-theme")||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");
    var next=cur==="light"?"dark":"light"; root.setAttribute("data-theme",next);
    try{localStorage.setItem("theme",next);}catch(e){}
  });
  function current(){
    var panels=[].slice.call(document.querySelectorAll(".tab"));
    var id="";
    try{id=decodeURIComponent(location.hash.slice(1)).split("?")[0];}catch(e){}
    return panels.some(function(p){return p.getAttribute("data-route")===id;})?id:panels[0].getAttribute("data-route");
  }
  function picked(all){
    var h=location.hash.slice(1),q=h.indexOf("?");
    var v=q<0?null:new URLSearchParams(h.slice(q+1)).get("show");
    return v===null?all:v.split(",").filter(Boolean);
  }
  function pick(){
    var fig=document.querySelector("[data-picker]"),reach={};
    if(!fig){return;}
    var boxes=[].slice.call(fig.querySelectorAll("input"));
    var all=boxes.map(function(c){return c.value;}),on=picked(all);
    var inOn=function(id){return all.indexOf(id)<0||on.indexOf(id)>=0;};
    boxes.forEach(function(c){c.checked=on.indexOf(c.value)>=0;});
    var count=fig.querySelector("[data-count]");
    if(count){count.textContent=on.length+" of "+all.length;}
    [].forEach.call(fig.querySelectorAll("[data-pick]"),function(b){
      b.disabled=b.getAttribute("data-pick")==="all"?on.length===all.length:on.length===0;
    });
    [].forEach.call(fig.querySelectorAll("path[data-from]"),function(p){
      var f=p.getAttribute("data-from"),t=p.getAttribute("data-to"),shown=inOn(f)&&inOn(t);
      p.classList.toggle("off",!shown);
      if(shown){reach[f]=1;reach[t]=1;}
    });
    [].forEach.call(fig.querySelectorAll("[data-id]"),function(g){
      var id=g.getAttribute("data-id");
      g.classList.toggle("dim",all.indexOf(id)>=0?on.indexOf(id)<0:!reach[id]);
    });
  }
  function commit(){
    var boxes=document.querySelectorAll("[data-picker] input");
    var on=[].filter.call(boxes,function(c){return c.checked;}).map(function(c){return c.value;});
    history.replaceState(null,"","#overview"+(on.length===boxes.length?"":"?show="+on.join(",")));
    pick();
  }
  document.addEventListener("change",function(e){
    if(e.target.closest&&e.target.closest("[data-picker]")){commit();}
  });
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest("[data-pick]");
    if(!b){return;}
    var to=b.getAttribute("data-pick")==="all";
    [].forEach.call(document.querySelectorAll("[data-picker] input"),function(c){c.checked=to;});
    commit();
  });
  function hot(name){
    var svg=document.querySelector("[data-picker] svg");
    if(!svg){return;}
    svg.classList.toggle("hot",name!==null);
    [].forEach.call(svg.querySelectorAll(".lit"),function(x){x.classList.remove("lit");});
    if(name===null){return;}
    [].forEach.call(svg.querySelectorAll("path[data-from]"),function(p){
      var f=p.getAttribute("data-from"),t=p.getAttribute("data-to");
      if(f!==name&&t!==name){return;}
      p.classList.add("lit");
      [f,t].forEach(function(id){var g=svg.querySelector('[data-id="'+CSS.escape(id)+'"]');if(g){g.classList.add("lit");}});
    });
  }
  function lit(e){
    var c=e.target.closest&&e.target.closest("[data-picker] .pick-chip");
    hot(c?c.querySelector("input").value:null);
  }
  document.addEventListener("mouseover",lit);
  document.addEventListener("focusin",lit);
  var base=document.title;
  function show(){
    pick();
    var links=[].slice.call(document.querySelectorAll("a[data-route]"));
    var panels=[].slice.call(document.querySelectorAll(".tab"));
    var route=current();
    panels.forEach(function(p){p.hidden=p.getAttribute("data-route")!==route;});
    links.forEach(function(t){
      var r=t.getAttribute("data-route");
      var on=t.hasAttribute("data-top")?(route===r||route.indexOf(r+"/")===0):route===r;
      if(on){t.setAttribute("aria-current","page");}else{t.removeAttribute("aria-current");}
    });
    var open=panels.filter(function(p){return !p.hidden;})[0];
    document.title=(open?open.getAttribute("aria-label")+" - ":"")+base;
  }
  // A hash change is a new panel: its title takes focus so a screen reader says where it landed.
  function settle(){
    var h=document.querySelector(".tab:not([hidden]) h2.title");
    if(h){h.tabIndex=-1;h.focus({preventScroll:true});}
  }
  addEventListener("hashchange",function(){show();scrollTo(0,0);settle();});
  document.addEventListener("click",function(e){
    var a=e.target.closest&&e.target.closest("a.skip");
    if(!a){return;}
    e.preventDefault();
    var m=document.getElementById("main");m.focus();
  });
  window.qsmShow=show;
  show();
})();
`;

/** The pen and its editor, on the served page only: small, quiet, the same sharp corners and edges. */
export const PEN_CSS = `
.pen-wrap{position:relative;padding-right:38px;min-height:32px;min-width:0}
@media(max-width:520px){.pen-wrap{padding-right:0}.pen-wrap>.pen{position:static;float:right;width:28px;height:28px;margin:0 0 4px 8px}}
.pen-wrap.inline{display:inline-block}
.pen-wrap>.pen-read>p:last-child{margin-bottom:0}
.pen{position:absolute;top:0;right:0;width:32px;height:32px;padding:0;display:grid;place-items:center;background:transparent;color:var(--muted);border:1px solid var(--edge);border-radius:0;cursor:pointer}
.pen svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.pen:hover{color:var(--heading);border-color:var(--edge);background:var(--raised)}
.pen-wrap.editing>.pen,.pen-wrap.editing>.pen-read{display:none}
.pen-wrap.editing{padding-right:0}
.pen-edit{display:flex;flex-direction:column;gap:10px;background:var(--raised);border:2px solid var(--edge);padding:12px 14px;box-shadow:3px 3px 0 var(--shade)}
.pen-edit label{display:flex;flex-direction:column;gap:4px;font-size:var(--fs-14);font-weight:600;color:var(--muted)}
.pen-edit input,.pen-edit select,.pen-edit textarea{font:inherit;font-size:var(--fs-16);font-weight:400;color:var(--text);background:var(--surface);border:2px solid var(--muted);border-radius:0;padding:6px 8px;width:100%}
.pen-edit textarea{min-height:5.5em;resize:vertical}
.pen-edit textarea.long{min-height:12em;font-family:var(--mono);font-size:var(--fs-14)}
.hint{font-size:var(--fs-12);font-weight:400;color:var(--muted)}
.case-menu{position:relative;flex:none}
.case-menu>summary{list-style:none;width:32px;height:32px;display:grid;place-items:center;color:var(--muted);border:1px solid var(--edge);cursor:pointer}
.case-menu>summary::-webkit-details-marker{display:none}
.case-menu>summary::after{content:none}
.case-menu>summary svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.case-menu>summary:hover{color:var(--heading);border-color:var(--edge);background:var(--raised)}
.case-menu[open]>.case-menu-body{position:absolute;right:0;top:36px;z-index:5;min-width:200px;display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--raised);border:2px solid var(--edge);box-shadow:3px 3px 0 var(--shade)}
.menu-item{padding-right:0;min-height:0}
.menu-item .pen{display:none}
.menu-item button[data-open]{font:inherit;font-size:var(--fs-14);color:var(--heading);background:transparent;border:1px solid var(--line);padding:4px 10px;cursor:pointer;width:100%;text-align:left}
.menu-item.editing{min-width:min(380px,80vw)}
.pen-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pen-actions button,.add-case{font:inherit;font-size:var(--fs-14);font-weight:600;color:var(--heading);background:var(--lavender-bg);border:2px solid var(--lavender);border-radius:0;padding:4px 12px;cursor:pointer}
.pen-actions button.cancel{background:transparent;border-color:var(--edge);color:var(--muted)}
.pen-status{font-size:var(--fs-14);color:var(--muted)}
.pen-toasts{position:fixed;right:16px;bottom:16px;max-width:min(420px,90vw);z-index:9}
.pen-toast{background:var(--mint-bg);color:var(--heading);border:2px solid var(--mint);box-shadow:4px 4px 0 var(--shade);padding:10px 14px;font-size:var(--fs-14); display:flex;align-items:center;gap:12px}
.pen-toast-x{font:inherit;font-size:var(--fs-18);line-height:1;color:var(--heading);background:transparent;border:2px solid var(--mint);min-inline-size:32px;min-block-size:32px;cursor:pointer;flex:none}
.live-fail{position:fixed;left:16px;bottom:16px;z-index:9;max-width:min(420px,90vw);background:var(--rose-bg);border-color:var(--rose)}
`;

/** On a published page the pens wait for the artifact database; until it answers the page is read-only. */
export const WAIT_CSS = `
html:not(.db-ready) .pen,html:not(.db-ready) .case-menu,html:not(.db-ready) .add-case{display:none}
html.db-ready .read-only{display:none}
`;
