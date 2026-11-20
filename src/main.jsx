import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity,Plus,Link2,Trash2,Download,Upload,Save,MapPin,RadioTower,GitBranch,Monitor,Settings2,Calculator,Route,RotateCcw,Undo2,Redo2,Search,LocateFixed,Sun,Moon,Menu,Lock,Unlock} from 'lucide-react';
import './style.css';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import AuthPage from './auth/AuthPage';
import { saveCloudProject, listCloudProjects, loadCloudProject, deleteCloudProject } from './lib/cloudProjects';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TYPES=[
 {type:'olt',label:'OLT',icon:'◉',name:'OLT'},
 {type:'feeder',label:'Feeder cable',icon:'━',name:'Feeder'},
 {type:'closure',label:'Splice closure',icon:'▣',name:'Closure'},
 {type:'splitter',label:'PLC splitter',icon:'⑂',name:'PLC splitter'},
 {type:'fbt',label:'FBT blister / coupler',icon:'◈',name:'FBT coupler'},
 {type:'terminal',label:'Distribution terminal',icon:'▤',name:'FAT / NAP'},
 {type:'endpoint',label:'ONU / Endpoint',icon:'⌂',name:'ONU'}
];
const defaults={
 olt:{launch:5.0},feeder:{},closure:{},splitter:{ratio:8,excess:1.2},fbt:{tapPercent:10},
 terminal:{},endpoint:{sensitivity:-27,requiredMargin:3}
};
const FBT_LOSS={5:12.4,10:10.6,15:8.8,20:7.3,25:6.1,30:5.6,35:4.9,40:4.2,45:3.5,50:3.1,55:2.8,60:2.4,65:2.1,70:1.7,75:1.4,80:1.1,85:.7,90:.6,95:.4};
const uid=()=>`n${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
const starterNodes=[
 {id:'olt1',type:'olt',name:'OLT – POP',x:100,y:170},
 {id:'sp1',type:'splitter',name:'Primary splitter 1:4',x:360,y:170,ratio:4,excess:1.0},
 {id:'sp2',type:'splitter',name:'Secondary splitter 1:8',x:630,y:100,ratio:8,excess:1.2},
 {id:'sp3',type:'splitter',name:'Secondary splitter 1:8',x:630,y:300,ratio:8,excess:1.2},
 {id:'onu1',type:'endpoint',name:'ONU – House 01',x:910,y:70,sensitivity:-27,requiredMargin:3},
 {id:'onu2',type:'endpoint',name:'ONU – House 02',x:910,y:170,sensitivity:-27,requiredMargin:3},
 {id:'onu3',type:'endpoint',name:'ONU – House 03',x:910,y:270,sensitivity:-27,requiredMargin:3}
];
const starterLinks=[
 {id:'l1',from:'olt1',to:'sp1',km:2.0,attenuation:.35,splices:2,connectors:2},
 {id:'l2',from:'sp1',to:'sp2',km:1.1,attenuation:.35,splices:2,connectors:2},
 {id:'l3',from:'sp1',to:'sp3',km:1.3,attenuation:.35,splices:2,connectors:2},
 {id:'l4',from:'sp2',to:'onu1',km:.25,attenuation:.35,splices:1,connectors:2},
 {id:'l5',from:'sp2',to:'onu2',km:.4,attenuation:.35,splices:1,connectors:2},
 {id:'l6',from:'sp3',to:'onu3',km:.55,attenuation:.35,splices:1,connectors:2}
];
function pathFor(endpoint,nodes,links){
 const olt=nodes.find(n=>n.type==='olt'); if(!olt)return null;
 const q=[[olt.id,[olt.id],[]]],seen=new Set([olt.id]);
 while(q.length){const [id,ids,lids]=q.shift();if(id===endpoint.id)return {ids,lids};
  for(const l of links){const next=l.from===id?l.to:l.to===id?l.from:null;if(next&&!seen.has(next)&&nodes.some(n=>n.id===next)){seen.add(next);q.push([next,[...ids,next],[...lids,l.id]])}}
 }
 return null;
}
function calcEndpoint(ep,nodes,links,settings){
 const path=pathFor(ep,nodes,links);if(!path)return {ep,path:null,reachable:false};
 let ratio=1,splitLoss=0,fbtLoss=0,fbtPath=[],excess=0,fiber=0,splice=0,connector=0;
 const route=path.lids.map(id=>links.find(l=>l.id===id)).filter(Boolean);
 path.ids.forEach((id,i)=>{const node=nodes.find(n=>n.id===id);if(!node)return;if(node.type==='splitter'){const r=Math.max(2,Number(node.ratio)||2);ratio*=r;splitLoss+=10*Math.log10(r);excess+=Math.max(0,Number(node.excess)||0)}if(node.type==='fbt'){const exitLink=links.find(l=>l.id===path.lids[i]);const port=exitLink?.fbtPort||'through';const tap=Math.min(50,Math.max(5,Number(node.tapPercent)||10));const pct=port==='tap'?tap:100-tap;fbtPath.push(`${pct}% ${port}`);fbtLoss+=FBT_LOSS[pct]??FBT_LOSS[50]}});
 route.forEach(l=>{fiber+=(Math.max(0,Number(l.km)||0)*Math.max(0,Number(l.attenuation??settings.attenuation)||0));splice+=Math.max(0,Number(l.splices)||0)*settings.spliceLoss;connector+=Math.max(0,Number(l.connectors)||0)*settings.connectorLoss});
 const total=splitLoss+fbtLoss+excess+fiber+splice+connector;
 const launch=Number(oltPower(nodes))||settings.launch;
 const rx=launch-total,margin=rx-(Number(ep.sensitivity??settings.sensitivity)||-27);
 const required=Number(ep.requiredMargin??settings.margin)||0;
 return {ep,path,reachable:true,ratio,splitLoss,fbtLoss,fbtPath:fbtPath.join(" → "),excess,fiber,splice,connector,total,launch,rx,margin,required,pass:margin>=required};
}
function oltPower(nodes){return nodes.find(n=>n.type==='olt')?.launch??5}
function powerAtNode(targetId,nodes,links,settings){
 const path=pathFor(nodes.find(n=>n.id===targetId),nodes,links);if(!path)return null;
 const olt=nodes.find(n=>n.type==='olt');let loss=0;
 path.ids.forEach((id,i)=>{const node=nodes.find(n=>n.id===id);if(!node)return;
  if(node.type==='splitter')loss+=10*Math.log10(Math.max(2,Number(node.ratio)||2))+Math.max(0,Number(node.excess)||0);
  if(node.type==='fbt'&&i<path.lids.length){const out=links.find(l=>l.id===path.lids[i]);const tap=Math.min(50,Math.max(5,Number(node.tapPercent)||10));const pct=(out?.fbtPort||'through')==='tap'?tap:100-tap;loss+=FBT_LOSS[pct]??FBT_LOSS[50];}
  if(i<path.lids.length){const l=links.find(x=>x.id===path.lids[i]);if(l)loss+=Math.max(0,Number(l.km)||0)*Math.max(0,Number(l.attenuation??settings.attenuation)||0)+Math.max(0,Number(l.splices)||0)*settings.spliceLoss+Math.max(0,Number(l.connectors)||0)*settings.connectorLoss;}
 });
 return Number(olt?.launch??settings.launch)-loss;
}
const COMPATIBLE={
 olt:['feeder','closure','splitter','fbt'],
 feeder:['olt','feeder','closure','splitter','fbt','terminal','endpoint'],
 closure:['olt','feeder','closure','splitter','fbt','terminal'],
 splitter:['olt','feeder','closure','splitter','fbt','terminal','endpoint'],
 fbt:['olt','feeder','closure','splitter','fbt','terminal','endpoint'],
 terminal:['feeder','closure','splitter','fbt','terminal','endpoint'],
 endpoint:['feeder','splitter','fbt','terminal']
};
function compatibility(a,b){
 if(!a||!b)return {ok:false,reason:'Select two existing devices.'};
 if(a.id===b.id)return {ok:false,reason:'A device cannot connect to itself.'};
 if(!(COMPATIBLE[a.type]||[]).includes(b.type))return {ok:false,reason:`${a.type.toUpperCase()} cannot connect directly to ${b.type.toUpperCase()}. Add a compatible feeder, closure, splitter, or terminal between them.`};
 return {ok:true,reason:'Compatible fiber connection.'};
}
function App(){
const { user, signOut } = useAuth();
const [accountMenu, setAccountMenu] = useState(false);
 const [cloudProjectId,setCloudProjectId]=useState(null);
 const [nodes,setNodes]=useState(()=>{try{const d=JSON.parse(localStorage.getItem('fiber-planner-v8')||localStorage.getItem('fiber-planner-v5')||'null');return d?.nodes||starterNodes}catch{return starterNodes}});
 const [links,setLinks]=useState(()=>{try{const d=JSON.parse(localStorage.getItem('fiber-planner-v8')||localStorage.getItem('fiber-planner-v5')||'null');return d?.links||starterLinks}catch{return starterLinks}});
 const [selected,setSelected]=useState('sp1'),[selectedLink,setSelectedLink]=useState(null);
 const [mode,setMode]=useState('select'),[source,setSource]=useState(''),[drag,setDrag]=useState(null);
 const [libraryOpen,setLibraryOpen]=useState(false),[view,setView]=useState('topology'),[baseMap,setBaseMap]=useState('satellite'),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const [projectMenu,setProjectMenu]=useState(false),[theme,setTheme]=useState('dark'),[mapQuery,setMapQuery]=useState(''),[mapSearchBusy,setMapSearchBusy]=useState(false);
 const [inspectorOpen,setInspectorOpen]=useState(false),[actionMenuId,setActionMenuId]=useState(''),[replaceTarget,setReplaceTarget]=useState('');
 const historyRef=useRef({items:[],index:-1,restoring:false});
 const pinchRef=useRef(null),canvasViewportRef=useRef(null),panRef=useRef(null),pointerMapRef=useRef(new Map());
 const geoRef=useRef(null),geoMapRef=useRef(null),tileRef=useRef(null),markersRef=useRef([]);
 const [settings,setSettings]=useState({launch:5,attenuation:.35,spliceLoss:.1,connectorLoss:.3,sensitivity:-27,margin:3});
 const [save,setSave]=useState('Saved'),[notice,setNotice]=useState('Select a device to inspect it. Choose Connect, then tap two devices to link them.');
 const [importRef]=[useRef(null)],svgRef=useRef(null);
 const chosen=nodes.find(n=>n.id===selected);
 const minNodeX=Math.min(...nodes.map(n=>Number(n.x)||0)),maxNodeX=Math.max(...nodes.map(n=>Number(n.x)||0));
 const minNodeY=Math.min(...nodes.map(n=>Number(n.y)||0)),maxNodeY=Math.max(...nodes.map(n=>Number(n.y)||0));
 const canvasW=Math.max(360,maxNodeX-minNodeX+190),canvasH=Math.max(260,maxNodeY-minNodeY+170);
 const centerX=(minNodeX+maxNodeX)/2+pan.x,centerY=(minNodeY+maxNodeY)/2+pan.y;
 const viewW=canvasW/zoom,viewH=canvasH/zoom;
 const canvasX=centerX-viewW/2,canvasY=centerY-viewH/2;
 const selectedPower=chosen?powerAtNode(chosen.id,nodes,links,settings):null;
 const results=useMemo(()=>nodes.filter(n=>n.type==='endpoint').map(ep=>calcEndpoint(ep,nodes,links,settings)),[nodes,links,settings]);
 const totalSplit=nodes.filter(n=>n.type==='splitter'||n.type==='fbt').length;
 useEffect(()=>{
  const h=historyRef.current;
  if(h.restoring){h.restoring=false;return;}
  const snapshot=JSON.stringify({nodes,links});
  if(h.index>=0&&h.items[h.index]===snapshot)return;
  h.items=h.items.slice(0,h.index+1);h.items.push(snapshot);if(h.items.length>80)h.items.shift();h.index=h.items.length-1;
 },[nodes,links]);
 function travelHistory(delta){const h=historyRef.current,next=h.index+delta;if(next<0||next>=h.items.length)return;h.index=next;h.restoring=true;const d=JSON.parse(h.items[next]);setNodes(d.nodes);setLinks(d.links);}
 function saveProject(){try{localStorage.setItem('fiber-planner-v8',JSON.stringify({version:5,nodes,links,settings}));setSave('Saved');setNotice('Project saved on this device.')}catch{setSave('Save failed')}}
 async function saveToCloud(){
  if(!user?.id){setNotice('Please sign in first.');return;}
  const name=prompt('Enter a name for this cloud project:', 'Fiber Planner Project');
  if(!name?.trim())return;
  try{
   const saved=await saveCloudProject({
    userId:user.id,
    projectId:cloudProjectId,
    name:name.trim(),
    data:{version:5,nodes,links,settings}
   });
   setCloudProjectId(saved.id);
   setNotice('Cloud project saved: '+saved.project_name);
  }catch(error){
   setNotice('Cloud save failed: '+error.message);
  }
 }

 async function manageCloudProjects(){
  if(!user?.id){setNotice('Please sign in first.');return;}
  try{
   const projects=await listCloudProjects(user.id);
   if(!projects.length){setNotice('You have no cloud projects yet.');return;}
   const choices=projects.map((p,i)=>
    (i+1)+'. '+p.project_name+' — '+new Date(p.updated_at).toLocaleString()
   ).join('\n');

   const answer=prompt(
    'MY CLOUD PROJECTS\n\n'+choices+
    '\n\nEnter project number to manage:'
   );
   if(answer===null)return;

   const index=Number(answer)-1;
   if(!Number.isInteger(index)||index<0||index>=projects.length){
    setNotice('Invalid project selection.');return;
   }

   const selectedProject=projects[index];
   const action=prompt(
    'Project: '+selectedProject.project_name+
    '\n\nType L to load or D to delete.',
    'L'
   );
   if(!action)return;

   if(action.trim().toLowerCase()==='l'){
    if(!confirm('Replace your current topology with this cloud project?'))return;

    const record=await loadCloudProject(user.id,selectedProject.id);
    const data=record.project_data;

    if(!data||!Array.isArray(data.nodes)||!Array.isArray(data.links)){
     setNotice('Invalid cloud project data.');return;
    }

    setNodes(data.nodes);
    setLinks(data.links);
    setSettings(data.settings||{
     launch:5,attenuation:.35,spliceLoss:.1,
     connectorLoss:.3,sensitivity:-27,margin:3
    });
    setCloudProjectId(record.id);
    setNotice('Loaded: '+record.project_name);

   }else if(action.trim().toLowerCase()==='d'){
    if(!confirm('Permanently delete '+selectedProject.project_name+'?'))return;

    await deleteCloudProject(user.id,selectedProject.id);
    if(cloudProjectId===selectedProject.id)setCloudProjectId(null);
    setNotice('Cloud project deleted.');
   }else{
    setNotice('No action taken.');
   }
  }catch(error){
   setNotice('Cloud operation failed: '+error.message);
  }
 }

 function locateMap(){if(!navigator.geolocation){setNotice('Location is not supported by this browser.');return;}navigator.geolocation.getCurrentPosition(pos=>{const {latitude,longitude}=pos.coords;if(geoMapRef.current){geoMapRef.current.setView([latitude,longitude],17);L.marker([latitude,longitude]).addTo(geoMapRef.current).bindPopup('Your current location').openPopup();}setNotice(`Map centered at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}.`)},err=>setNotice('Location unavailable: '+err.message),{enableHighAccuracy:true,timeout:12000});}
 async function searchMap(){const q=mapQuery.trim();if(!q)return;const coords=q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);if(coords){const lat=Number(coords[1]),lon=Number(coords[2]);if(Math.abs(lat)<=90&&Math.abs(lon)<=180){geoMapRef.current?.setView([lat,lon],17);setNotice(`Map centered at ${lat.toFixed(6)}, ${lon.toFixed(6)}.`);return;}}setMapSearchBusy(true);try{const res=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);const data=await res.json();if(!data.length){setNotice('No matching map location found.');return;}const lat=Number(data[0].lat),lon=Number(data[0].lon);if(geoMapRef.current)geoMapRef.current.setView([lat,lon],16);setNotice(`Found ${data[0].display_name}`);}catch{setNotice('Map search failed. Check your internet connection.')}finally{setMapSearchBusy(false);}}
 useEffect(()=>{
  if(view!=='geographic'||!geoRef.current)return;
  if(!geoMapRef.current)geoMapRef.current=L.map(geoRef.current,{zoomControl:true}).setView([13.6,123.2],11);
  const map=geoMapRef.current;
  if(tileRef.current)map.removeLayer(tileRef.current);
  tileRef.current=baseMap==='satellite'
   ?L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(map)
   :L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  markersRef.current.forEach(m=>m.remove());markersRef.current=[];
  nodes.forEach(node=>{if(node.lat!==undefined&&node.lng!==undefined&&Number.isFinite(Number(node.lat))&&Number.isFinite(Number(node.lng))){
   const color=node.type==='fbt'?'#f2c94c':node.type==='endpoint'?'#4da3ff':'#57d6c5';
   const marker=L.circleMarker([Number(node.lat),Number(node.lng)],{radius:8,color,fillColor:color,fillOpacity:.9}).addTo(map).bindPopup(`<b>${node.name}</b><br>${node.type}<br>${Number(node.lat).toFixed(6)}, ${Number(node.lng).toFixed(6)}`);
   marker.on('click',()=>{setSelected(node.id);setSelectedLink(null)});markersRef.current.push(marker);
  }});
  map.invalidateSize();
  if(!map._fiberCentered){const first=nodes.find(n=>n.lat!==undefined&&n.lng!==undefined);if(first){map.setView([first.lat,first.lng],15);map._fiberCentered=true;}}
  const onMapClick=e=>{if(selected&&!pos(selected)?.locked){setNodes(ns=>ns.map(n=>n.id===selected?{...n,lat:Number(e.latlng.lat.toFixed(6)),lng:Number(e.latlng.lng.toFixed(6))}:n));setNotice('Coordinates assigned to selected device.');}};
  map.on('click',onMapClick);return ()=>map.off('click',onMapClick);
 },[view,baseMap,nodes,selected]);
 useEffect(()=>{try{localStorage.setItem('fiber-planner-v8',JSON.stringify({version:5,nodes,links,settings}));setSave('Saved')}catch{setSave('Save failed')}},[nodes,links]);
 function addNode(type){setLibraryOpen(false);const meta=TYPES.find(t=>t.type===type);const id=uid();const n={id,type,name:`${meta.name} ${nodes.filter(x=>x.type===type).length+1}`,x:180+(nodes.length%4)*90,y:120+(nodes.length%5)*75,...defaults[type]};setNodes(v=>[...v,n]);setSelected(id);setSelectedLink(null);setNotice(`${n.name} added. Drag it into position.`)}
 function toggleNodeLock(id){const node=nodes.find(n=>n.id===id);if(!node)return;setNodes(ns=>ns.map(n=>n.id===id?{...n,locked:!n.locked}:n));setNotice(node.locked?'Material unlocked. You can edit and move it again.':'Material locked. Movement, editing, replacement and deletion are protected.');}
 function updateNode(k,v){if(chosen?.locked&&k!=='locked'){setNotice('This material is locked. Unlock it before editing.');return;}setNodes(ns=>ns.map(n=>n.id===selected?{...n,[k]:v}:n))}
 function replaceNode(id,type){
  const old=pos(id),meta=TYPES.find(t=>t.type===type);if(!old||!meta)return;if(old.locked){setNotice('Replacement blocked: unlock this material first.');return;}
  const next={...old,type,name:`${meta.name} ${nodes.filter(n=>n.type===type&&n.id!==id).length+1}`,...defaults[type]};
  const connected=links.filter(l=>l.from===id||l.to===id);
  const invalid=connected.find(l=>!compatibility(l.from===id?next:pos(l.from),l.to===id?next:pos(l.to)).ok);
  if(invalid){setNotice(`Replace blocked: ${type.toUpperCase()} is incompatible with a connected device. Change adjacent devices or links first.`);return;}
  setNodes(ns=>ns.map(n=>n.id===id?next:n));setSelected(id);setSelectedLink(null);setInspectorOpen(true);setReplaceTarget('');setNotice(`Replaced ${old.type.toUpperCase()} with ${type.toUpperCase()}. Position and links preserved.`);
 }

 function addLink(a,b){
  const check=compatibility(pos(a),pos(b));
  if(!check.ok){setNotice('Connection blocked: '+check.reason);return false;}
  if(links.some(l=>(l.from===a&&l.to===b)||(l.from===b&&l.to===a))){setNotice('Connection blocked: these devices are already connected.');return false;}
  const id=uid();setLinks(ls=>[...ls,{id,from:a,to:b,km:.5,attenuation:settings.attenuation,splices:1,connectors:2,cores:'single'}]);
  setSelectedLink(id);setSelected('');setNotice('Compatible fiber link created. Select the link to configure its cable properties.');return true;
 }
 function clickNode(id){if(mode==='connect'){if(!source){setSource(id);setNotice('Source selected. Now tap the destination device.')}else{const ok=addLink(source,id);if(ok){setMode('select');setSource('')}else{setSource('')}}}else{setSelected(id);setSelectedLink(null);setInspectorOpen(true);setActionMenuId('')}}
 function deleteSelected(){if(selected&&pos(selected)?.locked){setNotice('Deletion blocked: this material is locked. Unlock it first.');return;}if(selectedLink){setLinks(ls=>ls.filter(l=>l.id!==selectedLink));setSelectedLink(null);setInspectorOpen(false);return}if(selected){const target=pos(selected);if(!target)return;if(!window.confirm(`Delete ${target.name}? Connected fiber links will also be removed.`))return;setNodes(ns=>ns.filter(n=>n.id!==selected));setLinks(ls=>ls.filter(l=>l.from!==selected&&l.to!==selected));setSelected('');setInspectorOpen(false);setNotice(`${target.name} deleted.`)}}
 function exportJSON(){download('fiber-network-project.json',JSON.stringify({format:'fiber-planner-studio',version:1,nodes,links,settings},null,2),'application/json')}
 function exportCSV(){const rows=[['Endpoint','Reachable','Cumulative PLC ratio','FBT output path','PLC split loss dB','FBT loss dB','Excess loss dB','Fiber loss dB','Splice loss dB','Connector loss dB','Total loss dB','OLT Tx dBm','Estimated Rx dBm','Margin dB','Status']];results.forEach(r=>rows.push([r.ep.name,r.reachable,r.ratio?`1:${r.ratio}`:'',r.fbtPath,n(r.splitLoss),n(r.fbtLoss),n(r.excess),n(r.fiber),n(r.splice),n(r.connector),n(r.total),n(r.launch),n(r.rx),n(r.margin),r.pass?'PASS':'LOW MARGIN']));download('fiber-optical-budget.csv',rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv')}

  function escapeReport(value){return String(value??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function exportDiagramPNG(){
   const source=svgRef.current;if(!source){setNotice('Topology diagram is not available to export.');return;}
   const clone=source.cloneNode(true),vb=source.viewBox.baseVal;
   const width=Math.max(1200,Math.ceil(vb.width*2)),height=Math.max(800,Math.ceil(vb.height*2));
   clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',width);clone.setAttribute('height',height);
   const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');bg.setAttribute('x',vb.x);bg.setAttribute('y',vb.y);bg.setAttribute('width',vb.width);bg.setAttribute('height',vb.height);bg.setAttribute('fill','#000');clone.insertBefore(bg,clone.firstChild);
   const st=document.createElementNS('http://www.w3.org/2000/svg','style');st.textContent=`.cable{stroke:#36c8e8;stroke-width:3}.cable.fbt-tap{stroke:#ffd34f}.cable.fbt-through{stroke:#399cff}.link text{fill:#bdeeff;font:12px Arial;text-anchor:middle;paint-order:stroke;stroke:#000;stroke-width:4px}.shape-olt{fill:#123b5a;stroke:#54b9ff}.shape-splitter{fill:#282b64;stroke:#a88be8}.shape-fbt{fill:#59451d;stroke:#f4c64e}.shape-endpoint{fill:#174b3d;stroke:#64cba0}.shape-closure{fill:#394553;stroke:#9db2c2}.shape-terminal{fill:#214b50;stroke:#6bc6c0}.shape-feeder{fill:#253c4d;stroke:#78a8c8}.node-symbol{fill:#fff;text-anchor:middle;font:700 13px Arial}.node-label{fill:#fff;text-anchor:middle;font:700 12px Arial;paint-order:stroke;stroke:#000;stroke-width:4px}.node-sub{fill:#f2d17d;text-anchor:middle;font:11px Arial}.node-power{fill:#56f29a;text-anchor:middle;font:700 11px Arial;paint-order:stroke;stroke:#000;stroke-width:4px}.node-action{display:none}`;
   clone.insertBefore(st,clone.firstChild.nextSibling);
   const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'})),img=new Image();
   img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);URL.revokeObjectURL(url);canvas.toBlob(blob=>{if(!blob){setNotice('PNG export failed.');return;}const png=URL.createObjectURL(blob),a=document.createElement('a');a.href=png;a.download='fiber-topology-diagram.png';a.click();setTimeout(()=>URL.revokeObjectURL(png),1500);setNotice('Topology diagram exported as PNG.');},'image/png');};
   img.onerror=()=>{URL.revokeObjectURL(url);setNotice('Could not render the topology for PNG export.');};img.src=url;
  }
  function buildReportHTML(){
   let svg='';
   if(svgRef.current){
    const diagramNode=svgRef.current.cloneNode(true),vb=svgRef.current.viewBox.baseVal;
    diagramNode.setAttribute('xmlns','http://www.w3.org/2000/svg');diagramNode.setAttribute('width',Math.max(1000,vb.width*2));diagramNode.setAttribute('height',Math.max(700,vb.height*2));
    const diagramStyle=document.createElementNS('http://www.w3.org/2000/svg','style');
    diagramStyle.textContent='.cable{stroke:#36c8e8;stroke-width:3}.cable.fbt-tap{stroke:#ffd34f}.cable.fbt-through{stroke:#399cff}.link text{fill:#bdeeff;font:12px Arial;text-anchor:middle;paint-order:stroke;stroke:#000;stroke-width:4px}.shape-olt{fill:#123b5a;stroke:#54b9ff}.shape-splitter{fill:#282b64;stroke:#a88be8}.shape-fbt{fill:#59451d;stroke:#f4c64e}.shape-endpoint{fill:#174b3d;stroke:#64cba0}.shape-closure{fill:#394553;stroke:#9db2c2}.shape-terminal{fill:#214b50;stroke:#6bc6c0}.shape-feeder{fill:#253c4d;stroke:#78a8c8}.node-symbol{fill:#fff;text-anchor:middle;font:700 13px Arial}.node-label{fill:#fff;text-anchor:middle;font:700 12px Arial;paint-order:stroke;stroke:#000;stroke-width:4px}.node-sub{fill:#f2d17d;text-anchor:middle;font:11px Arial}.node-power{fill:#56f29a;text-anchor:middle;font:700 11px Arial;paint-order:stroke;stroke:#000;stroke-width:4px}.node-action{display:none}';
    diagramNode.insertBefore(diagramStyle,diagramNode.firstChild);svg=new XMLSerializer().serializeToString(diagramNode);
   }
   const diagram=svg?`<img class="diagram" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" alt="Fiber topology diagram">`:'<p>Diagram unavailable</p>';
   const typeLabel=t=>TYPES.find(x=>x.type===t)?.label||t;
   const nodeRows=nodes.map(x=>`<tr><td>${escapeReport(typeLabel(x.type))}</td><td>${escapeReport(x.name)}</td><td>${x.type==='splitter'?'1:'+escapeReport(x.ratio):x.type==='fbt'?`${escapeReport(x.tapPercent??10)}% tap / ${100-(x.tapPercent??10)}% through`:x.type==='olt'?`${escapeReport(x.launch??settings.launch)} dBm`:x.type==='endpoint'?`Sensitivity ${escapeReport(x.sensitivity??settings.sensitivity)} dBm; margin ${escapeReport(x.requiredMargin??settings.margin)} dB`:'—'}</td><td>${x.lat!=null&&x.lng!=null?`${escapeReport(x.lat)}, ${escapeReport(x.lng)}`:'—'}</td><td>${Math.round(x.x)}, ${Math.round(x.y)}</td></tr>`).join('');
   const linkRows=links.map(l=>`<tr><td>${escapeReport(pos(l.from)?.name||l.from)} → ${escapeReport(pos(l.to)?.name||l.to)}</td><td>${escapeReport(l.km)} km</td><td>${escapeReport(l.cores||'single')}</td><td>${escapeReport(l.attenuation??settings.attenuation)} dB/km</td><td>${escapeReport(l.splices??0)}</td><td>${escapeReport(l.connectors??0)}</td><td>${escapeReport(l.fbtPort||'—')}</td></tr>`).join('');
   const budgetRows=results.map(r=>`<tr><td>${escapeReport(r.ep.name)}</td><td>${r.reachable?'1:'+escapeReport(r.ratio):'No path'}</td><td>${escapeReport(r.fbtPath||'—')}</td><td>${r.reachable?n(r.splitLoss+r.fbtLoss+r.excess):'—'}</td><td>${r.reachable?n(r.fiber+r.splice+r.connector):'—'}</td><td>${r.reachable?n(r.total):'—'}</td><td>${r.reachable?n(r.launch):'—'}</td><td>${r.reachable?n(r.rx):'—'}</td><td>${r.reachable?n(r.margin):'—'}</td><td>${r.reachable?(r.pass?'PASS':'LOW MARGIN'):'NO PATH'}</td></tr>`).join('');
   return `<!doctype html><html><head><meta charset="utf-8"><title>Fiber Planner Project Report</title><style>*{box-sizing:border-box}body{font:12px Arial;color:#182632;margin:25px}h1{font-size:24px;margin:0 0 5px}h2{font-size:16px;color:#126078;margin:24px 0 8px}.meta{color:#607481;font-size:10px;margin-bottom:16px}.hero{background:#000;color:#fff;padding:12px;border-radius:8px}.diagram{display:block;width:100%;max-height:560px;object-fit:contain;background:#000}table{border-collapse:collapse;width:100%;font-size:10px;margin:8px 0 18px}th{background:#e8f1f5;text-align:left;color:#1d4558}td,th{border:1px solid #c9d7de;padding:6px;vertical-align:top}.assumptions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.assumptions div{border:1px solid #cad8df;padding:8px;border-radius:6px}.foot{margin-top:20px;color:#617581;font-size:9px}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body><h1>FTTH Fiber Planner — Project Report</h1><div class="meta">Generated ${new Date().toLocaleString()} · ${nodes.length} devices · ${links.length} links</div><section class="hero"><b>TOPOLOGY DIAGRAM</b>${diagram}</section>
   <h2>1. Network materials / devices</h2><table><thead><tr><th>Type</th><th>Display name</th><th>Material configuration</th><th>GPS coordinates</th><th>Canvas position</th></tr></thead><tbody>${nodeRows||'<tr><td colspan="5">No devices</td></tr>'}</tbody></table>
   <h2>2. Fiber links / cable segments</h2><table><thead><tr><th>From → To</th><th>Length</th><th>Core</th><th>Attenuation</th><th>Splices</th><th>Connectors</th><th>FBT port</th></tr></thead><tbody>${linkRows||'<tr><td colspan="7">No links</td></tr>'}</tbody></table>
   <h2>3. Endpoint optical budget</h2><table><thead><tr><th>Endpoint</th><th>Cumulative PLC ratio</th><th>FBT path</th><th>Split + excess loss (dB)</th><th>Route loss (dB)</th><th>Total loss (dB)</th><th>OLT Tx (dBm)</th><th>Estimated Rx (dBm)</th><th>Margin (dB)</th><th>Status</th></tr></thead><tbody>${budgetRows||'<tr><td colspan="10">No endpoints</td></tr>'}</tbody></table>
   <h2>4. Global loss assumptions</h2><div class="assumptions"><div>Fiber attenuation: <b>${escapeReport(settings.attenuation)} dB/km</b></div><div>Splice loss: <b>${escapeReport(settings.spliceLoss)} dB each</b></div><div>Connector loss: <b>${escapeReport(settings.connectorLoss)} dB each</b></div><div>Default ONU sensitivity: <b>${escapeReport(settings.sensitivity)} dBm</b></div><div>Required margin: <b>${escapeReport(settings.margin)} dB</b></div><div>Default OLT launch: <b>${escapeReport(settings.launch)} dBm</b></div></div><p class="foot">Optical values are engineering estimates based on configured launch power, passive losses, route lengths, splices and connectors. Not a live optical measurement.</p></body></html>`;
  }
  function exportPDF(){const w=window.open('','_blank');if(!w){setNotice('Allow pop-ups to generate the PDF report.');return;}w.document.open();w.document.write(buildReportHTML());w.document.close();w.onload=()=>{w.focus();setTimeout(()=>w.print(),350);};}
  function printReport(){const w=window.open('','_blank');if(!w){setNotice('Allow pop-ups to open the print report.');return;}w.document.open();w.document.write(buildReportHTML());w.document.close();w.onload=()=>{w.focus();setTimeout(()=>w.print(),350);};}
 function download(name,data,type){const blob=new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function importJSON(file){const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(reader.result);if(!Array.isArray(d.nodes)||!Array.isArray(d.links)||d.nodes.length>1000||d.links.length>5000)throw Error('Invalid project structure or size');const ids=new Set(d.nodes.map(x=>x.id));if(ids.size!==d.nodes.length||d.links.some(l=>!ids.has(l.from)||!ids.has(l.to)||l.from===l.to))throw Error('Duplicate device IDs or invalid link endpoints');const byId=new Map(d.nodes.map(n=>[n.id,n]));if(d.links.some(l=>!compatibility(byId.get(l.from),byId.get(l.to)).ok))throw Error('Project contains incompatible fiber connections. Correct the connections before importing.');if(!confirm('Replace the current fiber project? A local backup will be saved.'))return;localStorage.setItem('fiber-planner-backup',JSON.stringify({nodes,links}));setNodes(d.nodes);setLinks(d.links);setSettings(d.settings||settings);setNotice('Project imported. Previous project backed up locally.')}catch(e){setNotice('Import failed: '+e.message)}};reader.readAsText(file)}
 function n(v){return Number.isFinite(Number(v))?Number(v).toFixed(2):'—'}
 const link=links.find(l=>l.id===selectedLink);
 const pos=id=>nodes.find(x=>x.id===id);
 const pathResult=results.find(r=>r.ep.id===selected);
 return <div className={`app theme-${theme}`}>
  <header className={`app-header ${theme}`}>
   <div className="brand"><div className="eyebrow">FTTH DESIGN WORKSPACE</div><h1>Fiber Planner</h1><p>Plan · Connect · Measure · Optimize</p></div>
   <div className="header-tools">
    <button className="nav-main" onClick={()=>setProjectMenu(v=>!v)}><Menu size={16}/> Project <span className="save-dot">{save}</span></button>
    <button title="Undo" disabled={historyRef.current.index<=0} onClick={()=>travelHistory(-1)}><Undo2 size={17}/></button>
    <button title="Redo" disabled={historyRef.current.index>=historyRef.current.items.length-1} onClick={()=>travelHistory(1)}><Redo2 size={17}/></button>
    <button title="Save project" onClick={saveProject}><Save size={17}/></button>
    <button title="Toggle theme" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>
<div className="account-wrapper">
  <button
    className="account-button"
    onClick={() => setAccountMenu(v => !v)}
    title="Account settings"
  >
    <Lock size={17}/>
    Account
  </button>

  {accountMenu && (
    <div className="account-dropdown">
      <strong>Authenticated user</strong>
      <small>{user?.email}</small>

      <button onClick={async () => {
        if (!confirm('Are you sure you want to sign out?')) return;

        const { error } = await signOut();

        if (error) {
          setNotice(error.message);
        } else {
          setAccountMenu(false);
        }
      }}>
        <Unlock size={15}/>
        Sign out
      </button>
    </div>
  )}
</div>
</div>
   {projectMenu&&<div className="project-dropdown">
    <button onClick={()=>{saveProject();setProjectMenu(false)}}><Save size={15}/> Save project</button>
      <button onClick={()=>{saveToCloud();setProjectMenu(false)}}><Save size={15}/> Save to Cloud</button>
      <button onClick={()=>{manageCloudProjects();setProjectMenu(false)}}><Download size={15}/> My Cloud Projects</button>
    <button onClick={()=>{exportJSON();setProjectMenu(false)}}><Download size={15}/> Export project JSON</button>
    <button onClick={()=>{importRef.current.click();setProjectMenu(false)}}><Upload size={15}/> Import project</button>
    <button onClick={()=>{exportCSV();setProjectMenu(false)}}><Calculator size={15}/> Export optical budget CSV</button>
    <button onClick={()=>{exportDiagramPNG();setProjectMenu(false)}}><Download size={15}/> Export topology image (PNG)</button>
    <button onClick={()=>{exportPDF();setProjectMenu(false)}}><Download size={15}/> Export detailed report (PDF)</button>
    <button onClick={()=>{printReport();setProjectMenu(false)}}><Activity size={15}/> Print full project report</button>
    <button onClick={()=>{if(confirm('Restore the example topology?')){setNodes(starterNodes);setLinks(starterLinks);}setProjectMenu(false)}}><RotateCcw size={15}/> Load example</button>
   </div>}
   <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value=''}}/>
  </header>
  <div className="layout">

   <main className="center">
    <section className="map-panel panel"><div className="map-head"><div><div className="eyebrow">FIBER ROUTE MAP</div><h2>{view==='topology'?'Topology canvas':'Geographic fiber map'}</h2><small>{view==='topology'?'Drag nodes to arrange your route. Pinch with two fingers to zoom and drag to pan.':'Tap the map to assign coordinates to the selected device. Pinch to zoom and drag to pan.'}</small></div><div className="map-actions">
      <button className={`map-tool compact-tool ${mode==='select'?'active':''}`} title="Select / move" onClick={()=>{setMode('select');setSource('')}}><MapPin size={15}/></button>
      <button className={`map-tool compact-tool ${mode==='connect'?'active':''}`} title="Connect fiber" onClick={()=>{setMode('connect');setSource('');setNotice('Tap source device, then destination device.')}}><Link2 size={15}/></button>
      <button className="map-tool" onClick={()=>{if(view==='geographic')locateMap();else{setView('geographic');window.setTimeout(locateMap,700)}}} title="Find my location"><LocateFixed size={16}/></button>
      {view==='geographic'&&<form className="map-search" onSubmit={e=>{e.preventDefault();searchMap()}}><input value={mapQuery} onChange={e=>setMapQuery(e.target.value)} placeholder="Search place or coordinates"/><button type="submit" disabled={mapSearchBusy}><Search size={16}/></button></form>}
      <button className="map-tool" onClick={()=>setView(v=>v==='topology'?'geographic':'topology')}>{view==='topology'?'Map view':'Topology'}</button>
      {view==='geographic'&&<select value={baseMap} onChange={e=>setBaseMap(e.target.value)}><option value="satellite">Satellite</option><option value="street">Street</option></select>}
     </div></div>

     {view==='topology'?<div className="canvas-wrap"
      onPointerDownCapture={e=>{
       pointerMapRef.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
       if(pointerMapRef.current.size===2){
        const pts=[...pointerMapRef.current.values()],distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
        pinchRef.current={distance,zoom};panRef.current=null;
       }else if(pointerMapRef.current.size===1&&!e.target.closest?.('.node,.link')){
        panRef.current={x:e.clientX,y:e.clientY,panX:pan.x,panY:pan.y};
       }
      }}
      onPointerMoveCapture={e=>{
       if(!pointerMapRef.current.has(e.pointerId))return;
       pointerMapRef.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
       if(pointerMapRef.current.size>=2&&pinchRef.current){
        const pts=[...pointerMapRef.current.values()],distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
        setZoom(Math.max(.35,Math.min(5,pinchRef.current.zoom*distance/Math.max(1,pinchRef.current.distance))));
       }else if(pointerMapRef.current.size===1&&panRef.current){
        const dx=e.clientX-panRef.current.x,dy=e.clientY-panRef.current.y;
        const rect=e.currentTarget.getBoundingClientRect(),scaleX=viewW/Math.max(1,rect.width),scaleY=viewH/Math.max(1,rect.height);
        setPan({x:panRef.current.panX-dx*scaleX,y:panRef.current.panY-dy*scaleY});
       }
      }}
      onPointerUpCapture={e=>{pointerMapRef.current.delete(e.pointerId);if(pointerMapRef.current.size<2)pinchRef.current=null;if(pointerMapRef.current.size===0)panRef.current=null;}}
      onPointerCancelCapture={e=>{pointerMapRef.current.delete(e.pointerId);pinchRef.current=null;panRef.current=null;}}
      >
      <div className="canvas-scroll" ref={canvasViewportRef}>
      <svg ref={svgRef} viewBox={`${canvasX} ${canvasY} ${viewW} ${viewH}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" className="canvas" onPointerMove={e=>{if(!drag)return;const r=e.currentTarget.getBoundingClientRect();const dx=(e.clientX-drag.x)*(viewW/Math.max(1,r.width)),dy=(e.clientY-drag.y)*(viewH/Math.max(1,r.height));setNodes(ns=>ns.map(x=>x.id===drag.id?{...x,x:Math.max(35,x.x+dx),y:Math.max(40,x.y+dy)}:x));setDrag({id:drag.id,x:e.clientX,y:e.clientY})}} onPointerUp={()=>setDrag(null)} onPointerCancel={()=>setDrag(null)}>
      <defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#1a3448" strokeWidth="1"/></pattern></defs><rect x={canvasX} y={canvasY} width={canvasW} height={canvasH} fill="url(#grid)"/>
      {links.map(l=>{const a=pos(l.from),b=pos(l.to);if(!a||!b)return null;return <g key={l.id} onClick={e=>{e.stopPropagation();setSelectedLink(l.id);setSelected('');setInspectorOpen(true)}} className="link"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`cable ${a.type==='fbt'?(l.fbtPort==='tap'?'fbt-tap':'fbt-through'):''} ${selectedLink===l.id?'selected':''}`}/><text x={(a.x+b.x)/2} y={(a.y+b.y)/2-9}>{l.km} km · {l.cores||'single'}</text></g>})}
      {nodes.map(node=>{const t=TYPES.find(x=>x.type===node.type);return <g key={node.id} transform={`translate(${node.x},${node.y})`} className={`node ${selected===node.id?'chosen':''} ${source===node.id?'source':''}`} onPointerDown={e=>{if(mode==='select'&&!node.locked){e.currentTarget.setPointerCapture(e.pointerId);setDrag({id:node.id,x:e.clientX,y:e.clientY})}else if(node.locked){setNotice('This material is locked. Unlock it to move.');}e.stopPropagation()}} onClick={e=>{e.stopPropagation();clickNode(node.id)}}>{node.type==='olt'?<polygon className="shape-olt" points="0,-34 30,-17 30,17 0,34 -30,17 -30,-17"/>:node.type==='splitter'?<rect className="shape-splitter" x="-31" y="-25" width="62" height="50" rx="9"/>:node.type==='fbt'?<polygon className="shape-fbt" points="0,-34 31,0 0,34 -31,0"/>:node.type==='endpoint'?<path className="shape-endpoint" d="M-29 25 V-7 L0 -30 L29 -7 V25 Z"/>:node.type==='closure'?<rect className="shape-closure" x="-31" y="-23" width="62" height="46" rx="18"/>:node.type==='terminal'?<rect className="shape-terminal" x="-28" y="-28" width="56" height="56" rx="3"/>:<rect className="shape-feeder" x="-34" y="-18" width="68" height="36" rx="18"/>}<text className="node-symbol" y="6">{node.type==='olt'?'OLT':node.type==='splitter'?'PLC':node.type==='fbt'?'FBT':node.type==='endpoint'?'ONU':node.type==='terminal'?'FAT':node.type==='closure'?'FOSC':'FIBER'}</text><text className="node-label" y="48">{node.name.length>23?node.name.slice(0,21)+'…':node.name}</text>{node.type==='splitter'&&<text className="node-sub" y="64">1:{node.ratio}</text>}{node.type==='fbt'&&<text className="node-sub" y="64">{node.tapPercent}/{100-node.tapPercent}%</text>}<text className="node-power" y="-43">{powerAtNode(node.id,nodes,links,settings)===null?'—':`${n(powerAtNode(node.id,nodes,links,settings))} dBm`}</text>{node.locked&&<g className="node-lock-indicator" transform="translate(25,-39)"><rect x="-8" y="-7" width="17" height="15" rx="3"/><path d="M-4 -7v-3a4 4 0 0 1 8 0v3"/></g>}
       <g className={`node-actions ${actionMenuId===node.id?'expanded':''}`} transform="translate(37,-35)" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
        <g className="node-action menu-trigger" onClick={()=>setActionMenuId(v=>v===node.id?'':node.id)}><rect x="0" y="0" width="25" height="23" rx="6"/><text x="12.5" y="15">•••</text><title>Device actions</title></g>
        {actionMenuId===node.id&&<g className="node-action-popover" transform="translate(0,27)"><g className="node-action lock" onClick={()=>{toggleNodeLock(node.id);setActionMenuId('')}}><rect x="0" y="0" width="78" height="23" rx="5"/><text x="39" y="15">{node.locked?'Unlock':'Lock'}</text></g>
         <g className="node-action edit" transform="translate(0,26)" onClick={()=>{if(node.locked){setNotice('This material is locked. Unlock it before editing.');setActionMenuId('');return;}setSelected(node.id);setSelectedLink(null);setInspectorOpen(true);setActionMenuId('')}}><rect x="0" y="0" width="65" height="23" rx="5"/><text x="32.5" y="15">✎ Edit</text></g>
         <g className="node-action connect" transform="translate(0,52)" onClick={()=>{setMode('connect');setSource(node.id);setSelected(node.id);setInspectorOpen(false);setActionMenuId('');setNotice('Source selected. Tap a compatible destination device.')}}><rect x="0" y="0" width="65" height="23" rx="5"/><text x="32.5" y="15">↗ Link</text></g>
         <g className="node-action replace" transform="translate(0,78)" onClick={()=>{if(node.locked){setNotice('This material is locked. Unlock it before replacement.');setActionMenuId('');return;}setReplaceTarget(node.id);setActionMenuId('')}}><rect x="0" y="0" width="65" height="23" rx="5"/><text x="32.5" y="15">⇄ Replace</text></g>
        </g>}
       </g></g>})}
     </svg></div></div>:<div className="geo-map" ref={geoRef}/>}
     <div className="materials-tray">
      <div className="tray-heading"><div><b>NETWORK MATERIALS</b><small>Tap to add equipment to your design</small></div><span>{nodes.length} devices · {links.length} links</span></div>
      <div className="tray-items">{TYPES.map(t=><button className={`material-card material-${t.type}`} key={t.type} onClick={()=>addNode(t.type)} title={`Add ${t.label}`}>
       <span className="material-glyph">{t.type==='olt'?'OLT':t.type==='splitter'?'PLC':t.type==='fbt'?'FBT':t.type==='endpoint'?'ONU':t.type==='terminal'?'FAT':t.type==='closure'?'FOSC':'FBR'}</span>
       <span className="material-copy"><b>{t.label}</b><small>{t.type==='splitter'?'Optical split':t.type==='fbt'?'Tap / through':t.type==='endpoint'?'Subscriber terminal':t.type==='olt'?'Optical line terminal':t.type==='feeder'?'Fiber cable':t.type==='closure'?'Splice enclosure':'Distribution point'}</small></span>
       <Plus size={14}/>
      </button>)}</div>
     </div>
     <div className="canvas-foot"><span>{view==='topology'?'SCHEMATIC / NOT TO SCALE':'GEOGRAPHIC MAP / GPS COORDINATES'}</span><span>Link labels show configured route length</span><span>{mode==='connect'?'CONNECT MODE ACTIVE':'SELECT MODE'}</span></div>
    </section>
    <section className="panel results"><div className="panel-title"><span>ENDPOINT OPTICAL BUDGET</span><small>Auto-calculated from OLT through PLC and FBT splitters</small></div><div className="table-wrap"><table><thead><tr><th>Endpoint</th><th>PLC ratio</th><th>FBT output</th><th>Split loss</th><th>Route loss</th><th>Rx estimate</th><th>Margin</th><th>Status</th></tr></thead><tbody>{results.map(r=><tr key={r.ep.id} onClick={()=>{setSelected(r.ep.id);setSelectedLink(null)}}><td>{r.ep.name}</td><td>{r.reachable?`1:${r.ratio}`:'—'}</td><td>{r.reachable?(r.fbtPath||'—'):'—'}</td><td>{r.reachable?n(r.splitLoss+r.fbtLoss+r.excess)+' dB':'—'}</td><td>{r.reachable?n(r.fiber+r.splice+r.connector)+' dB':'—'}</td><td>{r.reachable?n(r.rx)+' dBm':'—'}</td><td>{r.reachable?n(r.margin)+' dB':'—'}</td><td><span className={r.reachable?(r.pass?'status-good':'status-bad'):'status-na'}>{r.reachable?(r.pass?'PASS':'LOW'):'NO PATH'}</span></td></tr>)}</tbody></table></div></section>
   </main>
   {inspectorOpen&&<div className="inspector-backdrop" onClick={()=>setInspectorOpen(false)}/>}
   <aside className={`right panel inspector-panel ${inspectorOpen?"is-open":""}`} style={{display:inspectorOpen?"block":"none"}}><div className="inspector-heading"><div className="panel-title"><span>INSPECTOR</span><small>{link?'Fiber link':chosen?'Device':'Settings'}</small></div><div className="inspector-header-actions">{chosen&&<><button className={`header-action lock-action ${chosen.locked?'is-locked':''}`} onClick={()=>toggleNodeLock(chosen.id)} title={chosen.locked?'Unlock material':'Lock material'} aria-label={chosen.locked?'Unlock material':'Lock material'}>{chosen.locked?<><Unlock size={15}/><span>Unlock</span></>:<><Lock size={15}/><span>Lock</span></>}</button><button className="header-action delete-action" disabled={chosen.locked} onClick={deleteSelected} title={chosen.locked?'Unlock before deleting':'Delete material'} aria-label="Delete material"><Trash2 size={15}/><span>Delete</span></button></>}{link&&<button className="header-action delete-action" onClick={deleteSelected} title="Delete fiber link"><Trash2 size={15}/><span>Delete</span></button>}<button className="inspector-close" onClick={()=>setInspectorOpen(false)} aria-label="Close settings">×</button></div></div>
    {chosen&&<><h3>{chosen.name}</h3><div className={`lock-status ${chosen.locked?'is-locked':''}`}><div><b>{chosen.locked?'Material protected':'Material unlocked'}</b><small>{chosen.locked?'Accidental movement and changes are blocked.':'This material can be moved and edited.'}</small></div><button className="lock-toggle" onClick={()=>toggleNodeLock(chosen.id)}>{chosen.locked?<><Unlock size={15}/> Unlock</>:<><Lock size={15}/> Lock material</>}</button></div><div className={chosen.locked?'locked-fields':''}><div className="rx-card power-card"><small>ESTIMATED OPTICAL POWER AT THIS NODE</small><b>{selectedPower===null?'No upstream path':`${n(selectedPower)} dBm`}</b><span>Calculated from OLT launch power and upstream passive losses.</span></div><div className="field-grid"><label>Latitude<input type="number" step="0.000001" value={chosen.lat??''} placeholder="Tap map to set" onChange={e=>updateNode('lat',e.target.value===''?undefined:Number(e.target.value))}/></label><label>Longitude<input type="number" step="0.000001" value={chosen.lng??''} placeholder="Tap map to set" onChange={e=>updateNode('lng',e.target.value===''?undefined:Number(e.target.value))}/></label></div>{chosen.lat!=null&&chosen.lng!=null&&<a className="maps-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${chosen.lat},${chosen.lng}`}>Open coordinates in Google Maps ↗</a>}<label>Display name<input value={chosen.name} onChange={e=>updateNode('name',e.target.value)}/></label><div className="field-grid"><label>X position<input type="number" value={Math.round(chosen.x)} onChange={e=>updateNode('x',Number(e.target.value))}/></label><label>Y position<input type="number" value={Math.round(chosen.y)} onChange={e=>updateNode('y',Number(e.target.value))}/></label></div>
     {chosen.type==='olt'&&<><label>OLT launch power (dBm)<input type="number" step=".1" value={chosen.launch??settings.launch} onChange={e=>updateNode('launch',Number(e.target.value))}/></label></>}
     {chosen.type==='fbt'&&<><label>FBT tap output ratio (%)<select value={chosen.tapPercent??10} onChange={e=>updateNode('tapPercent',Number(e.target.value))}>{Object.keys(FBT_LOSS).filter(v=>Number(v)<=50).map(v=><option value={v} key={v}>{v}% tap / {100-Number(v)}% through</option>)}</select></label><div className="calc-note">Tap port loss: <b>{FBT_LOSS[chosen.tapPercent??10]} dB</b> · Through port loss: <b>{FBT_LOSS[100-(chosen.tapPercent??10)]} dB</b><br/>Choose Tap or Through on each outgoing fiber link from this FBT coupler. Values follow the supplied loss chart.</div></>}
     {chosen.type==='splitter'&&<><label>Splitter ratio<select value={chosen.ratio} onChange={e=>updateNode('ratio',Number(e.target.value))}>{[2,4,8,16,32,64].map(v=><option value={v} key={v}>1:{v}</option>)}</select></label><label>Excess insertion loss (dB)<input type="number" min="0" step=".1" value={chosen.excess??1.2} onChange={e=>updateNode('excess',Number(e.target.value))}/></label><div className="calc-note">Ideal split loss: <b>{n(10*Math.log10(chosen.ratio))} dB</b> + excess loss {n(chosen.excess)} dB</div></>}
     {chosen.type==='endpoint'&&<><label>ONU receiver sensitivity (dBm)<input type="number" step=".5" value={chosen.sensitivity??-27} onChange={e=>updateNode('sensitivity',Number(e.target.value))}/></label><label>Required engineering margin (dB)<input type="number" step=".5" value={chosen.requiredMargin??3} onChange={e=>updateNode('requiredMargin',Number(e.target.value))}/></label>{pathResult?.reachable&&<div className="rx-card"><small>ESTIMATED RECEIVED POWER</small><b>{n(pathResult.rx)} dBm</b><span>Optical margin: {n(pathResult.margin)} dB · {pathResult.pass?'Within configured margin':'Below configured margin'}</span></div>}</>}

     </div></>}
    {link&&<><h3>Fiber segment</h3><p className="subtle">{pos(link.from)?.name} → {pos(link.to)?.name}</p>{(pos(link.from)?.type==='fbt'||pos(link.to)?.type==='fbt')&&<><label>FBT output port role<select value={link.fbtPort||'through'} onChange={e=>setLinks(ls=>ls.map(l=>l.id===link.id?{...l,fbtPort:e.target.value}:l))}><option value="tap">Tap output</option><option value="through">Through output</option></select></label><div className="calc-note">Applied when the optical path leaves the FBT node through this link. The incoming link setting is ignored.</div></>}
    <label>Fiber core configuration<select value={link.cores||'single'} onChange={e=>setLinks(ls=>ls.map(l=>l.id===link.id?{...l,cores:e.target.value}:l))}><option value="single">Single core</option><option value="dual">Dual core</option></select></label><div className="calc-note">Core count is a cable-planning attribute; optical loss is calculated per selected fiber path.</div><label>Route length (km)<input type="number" min="0" step=".01" value={link.km} onChange={e=>setLinks(ls=>ls.map(l=>l.id===link.id?{...l,km:Number(e.target.value)}:l))}/></label><label>Fiber attenuation (dB/km)<input type="number" min="0" step=".01" value={link.attenuation??settings.attenuation} onChange={e=>setLinks(ls=>ls.map(l=>l.id===link.id?{...l,attenuation:Number(e.target.value)}:l))}/></label><div className="field-grid"><label>Splices<input type="number" min="0" value={link.splices??0} onChange={e=>setLinks(ls=>ls.map(l=>l.id===link.id?{...l,splices:Number(e.target.value)}:l))}/></label><label>Connectors<input type="number" min="0" value={link.connectors??0} onChange={e=>setLinks(ls=>ls.map(l=>l.id===link.id?{...l,connectors:Number(e.target.value)}:l))}/></label></div><button className="danger full" onClick={deleteSelected}><Trash2 size={14}/> Delete fiber link</button></>}
    {!chosen&&!link&&<p className="hint">Select a node or fiber line on the canvas to edit its properties.</p>}
    <div className="divider"/><div className="panel-title"><span>GLOBAL LOSS ASSUMPTIONS</span></div>
    <label>Default fiber attenuation (dB/km)<input type="number" step=".01" value={settings.attenuation} onChange={e=>setSettings(s=>({...s,attenuation:Number(e.target.value)}))}/></label>
    <div className="field-grid"><label>Splice loss (dB)<input type="number" step=".01" value={settings.spliceLoss} onChange={e=>setSettings(s=>({...s,spliceLoss:Number(e.target.value)}))}/></label><label>Connector loss (dB)<input type="number" step=".01" value={settings.connectorLoss} onChange={e=>setSettings(s=>({...s,connectorLoss:Number(e.target.value)}))}/></label></div>
    <label>Default ONU sensitivity (dBm)<input type="number" value={settings.sensitivity} onChange={e=>setSettings(s=>({...s,sensitivity:Number(e.target.value)}))}/></label><label>Default required margin (dB)<input type="number" value={settings.margin} onChange={e=>setSettings(s=>({...s,margin:Number(e.target.value)}))}/></label>
    <div className="formula"><b>FBT reference chart (loss dB)</b><small>Tap % → loss: 5→12.4, 10→10.6, 15→8.8, 20→7.3, 25→6.1, 30→5.6, 35→4.9, 40→4.2, 45→3.5, 50→3.1. Through % uses the complementary percentage: 55→2.8, 60→2.4, 65→2.1, 70→1.7, 75→1.4, 80→1.1, 85→0.7, 90→0.6, 95→0.4.</small></div><div className="formula"><b>Budget formula</b><code>Rx = Tx − (PLC loss + FBT port loss + excess + fiber + splice + connector losses)</code><small>Each endpoint is traced independently from the OLT. Cascaded splitter ratios multiply.</small></div>
   </aside>
  </div>
  {replaceTarget&&<div className="replace-backdrop" onClick={()=>setReplaceTarget('')}><div className="replace-dialog" role="dialog" aria-modal="true" aria-label="Replace material" onClick={e=>e.stopPropagation()}>
   <div className="inspector-heading"><div><b>REPLACE MATERIAL</b><small>Keep device position and fiber links</small></div><button className="inspector-close" onClick={()=>setReplaceTarget('')}>×</button></div>
   <div className="replace-options">{TYPES.filter(t=>t.type!==pos(replaceTarget)?.type).map(t=><button key={t.type} className="replace-option" onClick={()=>replaceNode(replaceTarget,t.type)}><span>{t.type==='olt'?'OLT':t.type==='splitter'?'PLC':t.type==='fbt'?'FBT':t.type==='endpoint'?'ONU':t.type==='terminal'?'FAT':t.type==='closure'?'FOSC':'FBR'}</span><b>{t.label}</b></button>)}</div>
  </div></div>}
  <footer><Activity size={14}/> Fiber Planner Studio V8 · Optical budget is an engineering estimate, not a live measurement.</footer>
 </div>
}

function ApplicationRoot() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="auth-loading">
      Restoring secure session...
    </div>;
  }

  return user ? <App /> : <AuthPage />;
}

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ApplicationRoot />
  </AuthProvider>
);
