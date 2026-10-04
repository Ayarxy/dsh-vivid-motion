(() => {
  const h=React.createElement, output=document.querySelector('#status');
  let Component, root, enabled=true, disposers=[], selections=0, frameCount=0, samples=[], recording=false;
  const icons={IconChevronDownOutlineRegular:'m4 6 4 4 4-4',IconChevronRightOutlineRegular:'m6 3 5 5-5 5',
    IconCheckOutlineRegular:'m2 8 4 4 8-9',IconRefreshOutlineRegular:'M3 5a6 6 0 1 1-1 5 M3 1v4h4',IconDataOutlineRegular:'M2 3h12M2 8h12M2 13h12'};
  const primitives={
    MenuSurface:React.forwardRef((props,ref)=>h('div',{...props,ref})),StateDot:()=>h('span',null,'…'),
    rankByName:(models,query)=>models.filter(model=>model.name.toLowerCase().includes(query.toLowerCase())),
    useAnchoredPosition({open,anchorRef,panelRef}){
      const [placement,setPlacement]=React.useState(null);
      React.useLayoutEffect(()=>{
        if(!open||!panelRef.current)return;
        const update=()=>{const rect=anchorRef.current.getBoundingClientRect();setPlacement({top:Math.max(100,rect.top-panelRef.current.offsetHeight-8),left:rect.right-panelRef.current.offsetWidth});};
        update();const observer=new ResizeObserver(update);observer.observe(panelRef.current);return()=>observer.disconnect();
      },[open]);return placement;
    },
    useDismissOnOutsidePointer(root,open,setOpen,panel){React.useEffect(()=>{
      if(!open)return;const close=event=>{if(!root.current?.contains(event.target)&&!panel.current?.contains(event.target))setOpen(false);};
      document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
    },[open]);}
  };
  for(const [name,path] of Object.entries(icons))primitives[name]=props=>h('svg',{viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,...props},h('path',{d:path}));
  const plugin=window.sliderModule.factory(name=>name==='react'?React:name==='react-dom'?ReactDOM:primitives);
  const efforts=['low','medium','high','xhigh','max','ultra'].map((id,index)=>({id,name:['Light','Medium','High','Extra High','Max','Ultra'][index]}));
  const deepSeekEfforts=['off','low','high','max'].map(id=>({id,name:id[0].toUpperCase()+id.slice(1)}));
  const groups=[{id:'a',name:'测试供应商',models:[{id:'model',name:'DeepSeek-V4.1-Flash',reasoning:{defaultEffort:'high',efforts:deepSeekEfforts}},
    {id:'codex',name:'GPT-6 Astra',reasoning:{defaultEffort:'high',efforts}},
    {id:'two',name:'第二个模型',reasoning:{defaultEffort:'high',efforts:efforts.slice(0,3)}},
    {id:'three',name:'无推理档位'},{id:'four',name:'第四个模型'},{id:'five',name:'第五个模型'}]}];
  let snapshot={groups,current:{provider:'a',model:'model',reasoningEffort:'high'},pending:null,failures:[],status:'ready'},listeners=new Set();
  const update=patch=>{snapshot={...snapshot,...patch};for(const fn of listeners)fn();};
  const directory={store:{getSnapshot:()=>snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}},load:async()=>{},
    async select(selection){selections++;update({pending:selection});if(document.querySelector('#delay').checked)await new Promise(done=>setTimeout(done,500));update({current:selection,pending:null});return {ok:true};}};
  const ctx={get:()=>null,effect(fn){disposers.push(fn());},inject(_names,fn){fn({
    slots:{inject(_name,fn){disposers.push(fn());},register(spec,component){Component=component;return()=>{};}},modelDirectories:{directoryFor:()=>directory},sessions:{subagentAddress:()=>undefined}
  });}};
  function mount(){plugin.apply(ctx);root=ReactDOM.createRoot(document.querySelector('#root'));root.render(h(Component,{available:true,locked:false,directory:directory.store,load:()=>{},select:selection=>directory.select(selection)}));}
  mount();
  document.querySelector('#theme').onclick=()=>document.body.classList.toggle('dark');
  document.querySelector('#toggle').onclick=event=>{if(enabled){root.unmount();disposers.reverse().forEach(fn=>fn());disposers=[];}else mount();enabled=!enabled;event.target.textContent=enabled?'卸载组件':'挂载组件';};
  document.querySelector('#record').onclick=()=>{recording=true;samples=[];frameCount=0;output.textContent='已准备，下一次点击、拖动或键盘调档将记录真实浏览器绘制位置。';};
  function sample(time){
    const slider=document.querySelector('.dsh-reasoning-slider');
    if(!slider)return;
    const thumb=slider.querySelector('.dsh-reasoning-thumb'),track=slider.querySelector('.dsh-reasoning-track'),range=slider.querySelector('.dsh-reasoning-range');
    samples.push({time:Math.round(time),position:slider.style.getPropertyValue('--rs-position'),thumb:Math.round(thumb.getBoundingClientRect().x*100)/100,fill:Math.round(range.getBoundingClientRect().right*100)/100,drag:slider.dataset.dragging,maximum:slider.dataset.maximum});
    if(++frameCount<75)requestAnimationFrame(sample);else{recording=false;output.textContent=JSON.stringify({frames:samples.length,distinctPositions:new Set(samples.map(s=>s.position)).size,selections,first:samples[0],middle:samples[5],last:samples.at(-1),canvasSize:slider.querySelector('canvas')?[slider.querySelector('canvas').width,slider.querySelector('canvas').height]:null},null,2);}
  }
  document.addEventListener('input',event=>{if(recording&&frameCount===0&&event.target.type==='range'){frameCount=1;requestAnimationFrame(sample);}});
})();
