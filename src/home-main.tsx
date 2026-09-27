import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, FlaskConical, ChartNoAxesColumnIncreasing, FunctionSquare, Moon, Sun } from 'lucide-react';
import './home.css';
import './ui.css';
import { useColorTheme } from './useColorTheme';
import { WorkspaceBrand } from './WorkspaceBrand';

function Home() {
  const { theme, toggleTheme } = useColorTheme();
  return <div className="home-shell">
    <header className="home-header"><WorkspaceBrand label="数学探索室"/><span className="home-header-note">A-LEVEL MATHEMATICS</span><button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button></header>
    <main>
      <section className="home-intro"><div className="home-kicker"><span/> INTERACTIVE MATHEMATICS</div><h1>让数学，<br/>在探索中发生。</h1><p>画一条曲线，搭一个实验，观察一次变化。<br/>从直觉出发，走进数学背后的规律。</p><span className="home-intro-mark" aria-hidden="true">∫</span></section>
      <div className="home-section-heading"><h2>选择你的探索空间</h2><span>三个方向，同一种好奇心。</span></div>
      <section className="home-cards" aria-label="探索工具">
        <a className="home-card pure-card" href="/pure.html"><div className="home-card-top"><span>01 / PURE MATHEMATICS</span><FunctionSquare size={20}/></div><div className="home-art" aria-hidden="true"><svg viewBox="0 0 320 170"><path className="art-axis" d="M20 115H300 M110 155V15"/><path className="art-guide" d="M20 65H300 M20 145H300 M60 15V155 M210 15V155"/><path className="art-curve" d="M20 113C55 113 66 42 105 42S155 145 195 145 247 42 292 42"/><path className="art-second" d="M40 20Q155 235 280 20"/><circle cx="105" cy="42" r="5"/><text x="225" y="32">y = f(x)</text></svg></div><h3>纯数探索</h3><p>从函数到图像，从参数到变化。<br/>用可视化理解抽象的数学关系。</p><div className="home-tags"><span>函数绘图</span><span>极坐标</span><span>切线与积分</span></div><div className="home-card-bottom"><span>进入纯数探索</span><ArrowUpRight size={22}/></div></a>
        <a className="home-card mechanics-card" href="/mechanics.html"><div className="home-card-top"><span>02 / MECHANICS</span><FlaskConical size={20}/></div><div className="home-art" aria-hidden="true"><svg viewBox="0 0 320 170"><path d="M55 45L270 145H55Z" className="art-plane"/><path d="M55 45L270 145" className="art-curve"/><path className="art-axis" d="M30 145H295"/><g transform="translate(150 89) rotate(25)"><rect x="-21" y="-32" width="42" height="30" rx="4"/><text x="-5" y="-12" className="art-block-label">m</text></g><path d="M157 73V122 M157 122l-5 -8 M157 122l5 -8" className="art-force"/><path d="M165 75L187 28 M187 28l-9 6 M187 28l1 11" className="art-second"/><text x="194" y="35">R</text><text x="166" y="130">mg</text></svg></div><h3>力学实验</h3><p>亲手搭建情景，让物体开始运动。<br/>连接受力、方程与真实的变化。</p><div className="home-tags"><span>接触与抛体</span><span>碰撞事件</span><span>动态演化</span></div><div className="home-card-bottom"><span>进入力学实验</span><ArrowUpRight size={22}/></div></a>
        <a className="home-card probability-card" href="/statistics.html" aria-label="进入概率与统计"><div className="home-card-top"><span>03 / PROBABILITY</span><ChartNoAxesColumnIncreasing size={20}/></div><div className="home-art" aria-hidden="true"><svg viewBox="0 0 320 170"><path className="art-axis" d="M30 145H292"/>{[22,48,83,114,83,48,22].map((height,i) => <rect key={i} x={45+i*33} y={145-height} width="23" height={height} rx="3" opacity={0.3+height/190}/>)}<path className="art-second" d="M33 130C82 127 102 30 155 26S229 127 287 130" strokeDasharray="4 5"/></svg></div><h3>概率与统计</h3><p>从一组数据，到一个统计结论。<br/>连接概率、抽样与推断。</p><div className="home-tags"><span>数据与图表</span><span>概率分布</span><span>抽样与推断</span></div><div className="home-card-bottom"><span>进入统计工作台</span><ArrowUpRight size={22}/></div></a>
      </section>
      <footer className="home-footer"><span>为理解而探索 · Built for understanding</span><span>Mathroom / 数学探索室</span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Home/></React.StrictMode>);
