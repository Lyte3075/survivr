const http=require('http');
const fs=require('fs');
const path=require('path');
const WebSocket=require('ws');

const port=process.env.PORT||3000;
const root=__dirname;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};

function safeFile(url){
  const clean=decodeURIComponent((url||'/').split('?')[0]);
  let rel=clean==='/'?'/index.html':clean;
  if(rel==='/stable'||rel==='/stable/')rel='/stable/index.html';
  if(rel==='/experimental'||rel==='/experimental/')rel='/experimental/index.html';
  const full=path.resolve(root,'.'+rel);
  if(!full.startsWith(root+path.sep))return null;
  return full;
}
const server=http.createServer((req,res)=>{
  const file=safeFile(req.url);
  if(!file){res.writeHead(400);return res.end('Bad request')}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found')}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(data);
  });
});

const wss=new WebSocket.Server({server});
const players=new Map();
wss.on('connection',ws=>{
  const id=Math.random().toString(36).slice(2);
  players.set(id,{x:0,y:0});
  ws.send(JSON.stringify({type:'welcome',id}));
  ws.on('message',raw=>{
    try{
      const msg=JSON.parse(raw.toString());
      if(msg.type==='state'){
        const x=Number(msg.x),y=Number(msg.y);
        if(Number.isFinite(x)&&Number.isFinite(y))players.set(id,{x,y});
      }
    }catch{}
  });
  ws.on('close',()=>players.delete(id));
});
setInterval(()=>{
  const packet=JSON.stringify({type:'players',players:[...players].map(([id,p])=>({id,...p}))});
  for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(packet);
},50);
server.listen(port,'0.0.0.0',()=>console.log('Survivr server listening on '+port));