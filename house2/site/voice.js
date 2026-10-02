// VOICE-BEGIN (диктовка: блок до VOICE-END вклеивается в index.html, тестируется в tests/voice.test.js)
// Склейка распознанных кусков без повторов (Android Chrome присылает финалы накопительно или дублями)
function vNorm(s){return String(s||'').replace(/\s+/g,' ').trim()}
function vJoin(a,b){a=vNorm(a);b=vNorm(b);if(!b)return a;if(!a)return b;const la=a.toLowerCase(),lb=b.toLowerCase();
 if(lb.startsWith(la))return b;if(la.endsWith(lb))return a;
 // перекрытие «хвост a = начало b» (перезапуск повторил последние слова)
 const wa=a.split(' '),wb=b.split(' ');for(let k=Math.min(wa.length,wb.length);k>0;k--){if(wa.slice(-k).join(' ').toLowerCase()===wb.slice(0,k).join(' ').toLowerCase())return wa.concat(wb.slice(k)).join(' ')}
 return a+' '+b}
function vCollect(results){let fin='',tmp='';for(let i=0;i<results.length;i++){const r=results[i],t=r&&r[0]?r[0].transcript:'';if(r.isFinal)fin=vJoin(fin,t);else tmp+=' '+t}return{fin,tmp:vNorm(tmp)}}
const VMSG={'not-allowed':'Нет доступа к микрофону: разрешите его для сайта в настройках браузера (значок замка у адреса).','service-not-allowed':'Нет доступа к микрофону: разрешите его для сайта в настройках браузера.','audio-capture':'Микрофон не найден или занят другим приложением.','language-not-supported':'Браузер не распознаёт русский язык.'};
// Непрерывная диктовка: перезапуск после onend/no-speech/network, пока пользователь не нажмёт «Стоп»
// ui: {getText, setText, status(text, on)}; opt.timer — для тестов
function makeDictation(SR,ui,opt){opt=opt||{};const timer=opt.timer||setTimeout,MAXNET=opt.maxNet||5;
 let rec=null,want=false,base='',done='',sess='',netFails=0,fatal='',restartT=0;
 const show=tmp=>ui.setText(vJoin(vJoin(base,done),vJoin(sess,tmp)));
 function begin(){sess='';const r=new SR();rec=r;r.lang='ru-RU';r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
  r.onstart=()=>{if(r!==rec)return;ui.status('🎤 Слушаю… Говорите, паузы не страшны. Нажмите «Стоп», когда закончите.',true)};
  r.onresult=e=>{if(r!==rec)return;netFails=0;const c=vCollect(e.results);sess=c.fin;show(c.tmp)};
  r.onerror=e=>{if(r!==rec)return;const er=e.error;
   if(VMSG[er]){fatal=VMSG[er];want=false;return}
   if(er==='network'){netFails++;if(netFails>=MAXNET){fatal='Нет связи с сервисом распознавания. Проверьте интернет и нажмите 🎤 снова.';want=false}
    else ui.status('⚠ Связь с распознаванием прервалась, переподключаюсь…',true);return}
   if(er==='no-speech'){ui.status('🎤 Тишина… продолжаю слушать.',true);return}
   if(er!=='aborted')ui.status('⚠ Ошибка распознавания: '+er+'. Продолжаю…',true)};
  r.onend=()=>{if(r!==rec)return;done=vJoin(done,sess);sess='';show('');
   if(want){restartT=timer(()=>{restartT=0;if(want)tryStart()},netFails?Math.min(4000,500*netFails):250);return}
   rec=null;ui.status(fatal?'⚠ '+fatal:(vNorm(done)?'✓ Готово. Проверьте текст и нажмите «Разобрать».':''),false)};
  r.start()}
 function tryStart(){try{begin()}catch(e){want=false;rec=null;ui.status('⚠ '+(e&&e.message||'Не удалось включить микрофон'),false)}}
 return{get on(){return want},
  start(){if(want)return;want=true;fatal='';netFails=0;base=ui.getText();done='';tryStart()},
  stop(){want=false;if(rec){try{rec.stop()}catch(_){}}else ui.status(vNorm(done)?'✓ Готово. Проверьте текст и нажмите «Разобрать».':'',false)},
  toggle(){want?this.stop():this.start()}}}
// VOICE-END
// Закрытие окна по фону (пункт 2, вклеивает другая подзадача; в блок VOICE не входит): только если нажатие и отпускание были на самом фоне и нет выделения текста
function bindBackdrop(d,close,win){win=win||(typeof window!=='undefined'?window:{});let down=false;
 const mark=e=>{down=e.target===d};d.addEventListener('pointerdown',mark);d.addEventListener('mousedown',mark);
 d.addEventListener('click',e=>{const ok=down&&e.target===d;down=false;if(!ok)return;
  const s=win.getSelection&&win.getSelection();if(s&&String(s).length)return;close()})}
if(typeof module!=='undefined')module.exports={vNorm,vJoin,vCollect,makeDictation,bindBackdrop};
