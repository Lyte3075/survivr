const http=require('http');
const fs=require('fs');
const path=require('path');
const WebSocket=require('ws');

const port=process.env.PORT||3000;
const root=__dirname;
const TICK=20;
const MAX_PLAYERS=50;
const WORLD=1800;
const SPEED=210;
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
const rooms=new Map([['main',new Set()]]);

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const spawnPoint=()=>({x:(Math.random()-.5)*1200,y:(Math.random()-.5)*1200});

function packetForRoom(roomId){
  const room=rooms.get(roomId)||new Set();
  return JSON.stringify({
    type:'players',
    players:[...room].map(id=>{
      const p=players.get(id);
      return p?{id,x:p.x,y:p.y,hp:p.hp,dead:p.dead}:null;
    }).filter(Boolean)
  });
}

function broadcastRoom(roomId,msg){
  const room=rooms.get(roomId)||new Set();
  for(const id of room){
    const p=players.get(id);
    if(p&&p.ws.readyState===WebSocket.OPEN)p.ws.send(msg);
  }
}

function leave(id){
  const p=players.get(id);
  if(!p)return;
  const room=rooms.get(p.room);
  if(room)room.delete(id);
  players.delete(id);
}

wss.on('connection',ws=>{
  if(players.size>=MAX_PLAYERS){
    ws.send(JSON.stringify({type:'error',message:'Server is full.'}));
    ws.close();
    return;
  }

  const id=Math.random().toString(36).slice(2,10);
  const roomId='main';
  const spawn=spawnPoint();
  const p={
    id,ws,room:roomId,x:spawn.x,y:spawn.y,hp:100,dead:false,
    lastState:Date.now(),lastShot:0
  };
  players.set(id,p);
  rooms.get(roomId).add(id);

  ws.send(JSON.stringify({
    type:'welcome',
    id,
    room:roomId,
    spawn:{x:p.x,y:p.y},
    maxPlayers:MAX_PLAYERS
  }));
  ws.send(packetForRoom(roomId));
  broadcastRoom(roomId,JSON.stringify({type:'player_joined',id}));

  ws.on('message',raw=>{
    try{
      const msg=JSON.parse(raw.toString());
      if(msg.type==='state'){
        const x=Number(msg.x),y=Number(msg.y);
        if(!Number.isFinite(x)||!Number.isFinite(y)||p.dead)return;
        const now=Date.now();
        const dt=Math.min(.25,Math.max(.001,(now-p.lastState)/1000));
        const maxMove=SPEED*dt+18;
        const dx=clamp(x,-WORLD,WORLD)-p.x;
        const dy=clamp(y,-WORLD,WORLD)-p.y;
        const d=Math.hypot(dx,dy);
        if(d<=maxMove){
          p.x=clamp(x,-WORLD,WORLD);
          p.y=clamp(y,-WORLD,WORLD);
        }else{
          const s=maxMove/(d||1);
          p.x+=dx*s;p.y+=dy*s;
        }
        p.lastState=now;
      }

      if(msg.type==='shoot'&&!p.dead){
        const now=Date.now();
        if(now-p.lastShot<100)return;
        const tx=Number(msg.x),ty=Number(msg.y);
        if(!Number.isFinite(tx)||!Number.isFinite(ty))return;
        p.lastShot=now;

        let hit=null;
        let best=Infinity;
        const room=rooms.get(p.room)||new Set();
        for(const id2 of room){
          if(id2===id)continue;
          const t=players.get(id2);
          if(!t||t.dead)continue;
          const dx=tx-p.x,dy=ty-p.y,len=Math.hypot(dx,dy)||1;
          const ux=dx/len,uy=dy/len;
          const rx=t.x-p.x,ry=t.y-p.y;
          const along=rx*ux+ry*uy;
          if(along<0||along>760)continue;
          const side=Math.abs(rx*uy-ry*ux);
          if(side<=20&&along<best){best=along;hit=t}
        }

        broadcastRoom(p.room,JSON.stringify({
          type:'shot',
          shooter:id,
          x:p.x,y:p.y,
          tx,ty,
          hit:hit?hit.id:null
        }));

        if(hit){
          hit.hp=Math.max(0,hit.hp-22);
          if(hit.hp===0){
            hit.dead=true;
            broadcastRoom(p.room,JSON.stringify({
              type:'eliminated',
              id:hit.id,
              by:id
            }));
          }else{
            hit.ws.send(JSON.stringify({type:'damage',hp:hit.hp}));
          }
        }
      }

      if(msg.type==='respawn'){
        const s=spawnPoint();
        p.x=s.x;p.y=s.y;p.hp=100;p.dead=false;p.lastState=Date.now();
        ws.send(JSON.stringify({type:'respawned',x:p.x,y:p.y,hp:p.hp}));
      }
    }catch{}
  });

  ws.on('close',()=>{
    const room=p.room;
    leave(id);
    broadcastRoom(room,JSON.stringify({type:'player_left',id}));
  });
});

setInterval(()=>{
  for(const [roomId] of rooms){
    if(rooms.get(roomId).size)broadcastRoom(roomId,packetForRoom(roomId));
  }
},1000/TICK);

server.listen(port,'0.0.0.0',()=>console.log('Survivr multiplayer server listening on '+port));