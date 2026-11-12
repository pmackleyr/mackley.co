import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const handlers={};let resize;
 const control=()=>({disabled:false,attrs:{},addEventListener(n,fn){this[n]=fn},setAttribute(n,v){this.attrs[n]=v},removeAttribute(n){delete this.attrs[n]}});
 const previous=control(),next=control(),dots=[control(),control(),control()],count={textContent:'1 / 3'};
 const track={...control(),scrollLeft:0,clientWidth:400,children:[{},{},{}],scrollTo({left,behavior}){this.scrollLeft=left;this.behavior=behavior;this.scroll?.();}};
 const gallery={querySelector(s){return {'.mk-gallery__track':track,'[data-gallery-prev]':previous,'[data-gallery-next]':next,'[data-gallery-count]':count}[s]},querySelectorAll:()=>dots};
 const win={matchMedia:()=>({matches:false}),ResizeObserver:class{constructor(fn){resize=fn}observe(){}}};
 const doc={querySelector:()=>null,querySelectorAll:()=>[gallery]};
 const context=vm.createContext({window:win,document:doc,location:{hostname:'private-preview'},navigator:{},localStorage:{getItem:()=>null},ResizeObserver:win.ResizeObserver,requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame(){}});
 vm.runInContext(readFileSync('storefront.js','utf8'),context);
 return{previous,next,dots,count,track,resize:()=>resize()};
}
test('carousel arrows and photo dots reach exact slides, update status and clamp at ends',()=>{
 const f=fixture();assert.equal(f.previous.disabled,true);f.next.click();assert.equal(f.track.scrollLeft,400);assert.equal(f.count.textContent,'2 / 3');f.dots[2].click();assert.equal(f.track.scrollLeft,800);assert.equal(f.next.disabled,true);assert.equal(f.dots[2].attrs['aria-current'],'true');f.next.click();assert.equal(f.track.scrollLeft,800);f.previous.click();assert.equal(f.track.scrollLeft,400);
});
test('carousel supports keyboard Home/End and native swipe position updates',()=>{
 const f=fixture();const key=k=>f.track.keydown({key:k,preventDefault(){}});key('End');assert.equal(f.count.textContent,'3 / 3');key('Home');assert.equal(f.count.textContent,'1 / 3');key('ArrowRight');assert.equal(f.count.textContent,'2 / 3');f.track.scrollLeft=800;f.track.scroll();assert.equal(f.count.textContent,'3 / 3');
});
test('resizing retains the selected photograph rather than shifting between slides',()=>{
 const f=fixture();f.dots[2].click();f.track.clientWidth=275;f.resize();assert.equal(f.track.scrollLeft,550);assert.equal(f.track.behavior,'instant');assert.equal(f.count.textContent,'3 / 3');
});
