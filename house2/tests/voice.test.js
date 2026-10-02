// Непрерывная диктовка (site/voice.js) с моком SpeechRecognition. Запуск: node --test house2/tests/
const test=require('node:test'),assert=require('node:assert'),path=require('path'),fs=require('fs');
const {vJoin,vCollect,makeDictation}=require(path.join(__dirname,'..','site','voice.js'));

// Мок: каждый new SR() попадает в inst; события вызываются вручную
function mkSR(){const inst=[];class SR{constructor(){this.started=false;this.stopped=false;inst.push(this)}
 start(){this.started=true;this.onstart&&this.onstart()}stop(){this.stopped=true;this.onend&&this.onend()}}
 return{SR,inst,last:()=>inst[inst.length-1]}}
const res=(...xs)=>xs.map(([t,f])=>Object.assign([{transcript:t}],{isFinal:f}));
function setup(initial=''){const m=mkSR(),q=[];let text=initial,st={t:'',on:false};
 const d=makeDictation(m.SR,{getText:()=>text,setText:v=>{text=v},status:(t,on)=>{st={t,on}}},{timer:f=>{q.push(f);return 1}});
 return{m,d,q,get text(){return text},get st(){return st},tick(){const f=q.splice(0);f.forEach(x=>x())}}}

test('continuous=true, interim показывается',()=>{const s=setup();s.d.start();const r=s.m.last();
 assert.strictEqual(r.continuous,true);assert.strictEqual(r.interimResults,true);assert.strictEqual(r.lang,'ru-RU');
 r.onresult({results:res(['купить плинтус',true],[' в прихожую',false])});
 assert.strictEqual(s.text,'купить плинтус в прихожую');assert.ok(s.st.on)});

test('onend посреди диктовки → перезапуск, текст не теряется',()=>{const s=setup('Роман,');s.d.start();
 let r=s.m.last();r.onresult({results:res(['плинтус в прихожей',true])});r.onend();
 assert.strictEqual(s.m.inst.length,1,'перезапуск через таймер');s.tick();
 assert.strictEqual(s.m.inst.length,2);r=s.m.last();assert.ok(r.started);
 r.onresult({results:res(['до пятницы',true],[' срочно',false])});
 assert.strictEqual(s.text,'Роман, плинтус в прихожей до пятницы срочно');assert.ok(s.d.on)});

test('no-speech → перезапуск',()=>{const s=setup();s.d.start();const r=s.m.last();
 r.onerror({error:'no-speech'});assert.match(s.st.t,/Тишина/);r.onend();s.tick();
 assert.strictEqual(s.m.inst.length,2);assert.ok(s.m.last().started)});

test('network → перезапуск, после 5 подряд — понятная ошибка и стоп',()=>{const s=setup();s.d.start();
 for(let i=0;i<5;i++){const r=s.m.last();r.onerror({error:'network'});r.onend();s.tick()}
 assert.strictEqual(s.m.inst.length,5);assert.strictEqual(s.d.on,false);assert.match(s.st.t,/Нет связи/);assert.strictEqual(s.st.on,false)});

test('not-allowed → без перезапуска, сообщение про доступ к микрофону',()=>{const s=setup();s.d.start();const r=s.m.last();
 r.onerror({error:'not-allowed'});r.onend();s.tick();
 assert.strictEqual(s.m.inst.length,1);assert.match(s.st.t,/Нет доступа к микрофону/);assert.strictEqual(s.d.on,false)});

test('стоп пользователем → не перезапускается, текст сохранён',()=>{const s=setup();s.d.toggle();const r=s.m.last();
 r.onresult({results:res(['повесить светильник',true])});s.d.toggle();
 assert.ok(r.stopped);s.tick();assert.strictEqual(s.m.inst.length,1);
 assert.strictEqual(s.text,'повесить светильник');assert.strictEqual(s.st.on,false);assert.match(s.st.t,/Готово/)});

test('Android: накопительные/дублирующиеся финалы не повторяются',()=>{
 assert.strictEqual(vCollect(res(['купить',true],['купить плинтус',true],['купить плинтус',true])).fin,'купить плинтус');
 assert.strictEqual(vJoin('повесить светильник на кухне','на кухне первого этажа'),'повесить светильник на кухне первого этажа');
 assert.strictEqual(vJoin('раз два','три'),'раз два три');
 // после перезапуска сервис повторил хвост прошлой сессии
 const s=setup();s.d.start();let r=s.m.last();r.onresult({results:res(['плинтус в прихожей',true])});r.onend();s.tick();
 s.m.last().onresult({results:res(['в прихожей до пятницы',true])});assert.strictEqual(s.text,'плинтус в прихожей до пятницы')});

test('вклейка в html совпадает с site/voice.js',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','site','voice.js'),'utf8');
 const lf=s=>s.replace(/\r\n/g,'\n');
 const blk=lf(src.slice(src.indexOf('// VOICE-BEGIN'),src.indexOf('// VOICE-END')));
 for(const f of ['site/index.html','site/house2-single.html','deploy/index.html']){
  const h=lf(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));assert.ok(h.includes(blk),f+': блок VOICE устарел');
  assert.ok(!/continuous=false/.test(h),f+': осталась старая диктовка')}});
