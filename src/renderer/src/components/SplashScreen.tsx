import { useEffect, useState } from 'react'

export function SplashScreen() {
  const [show, setShow] = useState(true)

  useEffect(() => {
    const hasShown = sessionStorage.getItem('splashShown')
    if (hasShown) {
      setShow(false)
    } else {
      sessionStorage.setItem('splashShown', 'true')
      const timer = setTimeout(() => {
        setShow(false)
      }, 1800)
      return () => clearTimeout(timer)
    }
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center pointer-events-none" style={{ animation: 'splash-fade 1.8s ease-in-out forwards' }}>
      <style>{`
        @keyframes splash-fade {
          0%, 77% { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }
        @keyframes scrap-drop {
          0%, 11% { transform: translateY(-50vh); opacity: 0; }
          12% { transform: translateY(-50vh); opacity: 1; }
          22%, 100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes hammer-swing {
          0%, 16% { transform: translate(100px, -100px) rotate(45deg); opacity: 0; }
          17% { transform: translate(100px, -100px) rotate(45deg); opacity: 1; }
          22% { transform: translate(10px, -18px) rotate(-35deg); opacity: 1; }
          26%, 100% { transform: translate(25px, -5px) rotate(-15deg); opacity: 1; }
        }
        @keyframes spark-burst {
          0%, 32% { opacity: 0; transform: scale(0); filter: blur(4px); }
          33% { opacity: 1; transform: scale(1); filter: blur(0px); }
          50%, 100% { opacity: 0; transform: scale(2.5); filter: blur(4px); }
        }
        @keyframes text-fade {
          0%, 49% { opacity: 0; letter-spacing: 0; filter: blur(8px); }
          60%, 100% { opacity: 1; letter-spacing: 0.15em; filter: blur(0); }
        }
        
        .animate-scrap { animation: scrap-drop 1.8s cubic-bezier(0.5, 0, 0.75, 0) forwards; }
        .animate-hammer { animation: hammer-swing 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; transform-origin: bottom left; }
        .animate-sparks { animation: spark-burst 1.8s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }
        .animate-text { animation: text-fade 1.8s ease-out forwards; }
      `}</style>
      
      <div className="relative flex items-center justify-center w-64 h-64">
        {/* Netherite Scrap */}
        <div className="absolute animate-scrap w-16 h-16 bg-[#383437] border-4 border-[#252224] rounded-sm flex items-center justify-center overflow-hidden shadow-[inset_0_4px_8px_rgba(255,255,255,0.05)]">
          <div className="w-full h-full bg-[linear-gradient(45deg,#443f42_25%,transparent_25%,transparent_75%,#443f42_75%,#443f42),linear-gradient(45deg,#443f42_25%,transparent_25%,transparent_75%,#443f42_75%,#443f42)] bg-[length:8px_8px] bg-[position:0_0,4px_4px] opacity-40" />
        </div>

        {/* Hammer */}
        <div className="absolute animate-hammer z-10 w-20 h-20 -mt-20 ml-20">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
            {/* Handle */}
            <rect x="45" y="30" width="10" height="60" fill="#4a3b32" />
            <rect x="47" y="30" width="2" height="60" fill="#6d574b" />
            <rect x="43" y="85" width="14" height="5" fill="#2d241d" />
            {/* Head */}
            <path d="M 20 20 L 80 20 L 75 40 L 25 40 Z" fill="#5c5c5e" />
            <path d="M 22 22 L 78 22 L 74 38 L 26 38 Z" fill="#7a7a7c" />
            <rect x="35" y="15" width="30" height="5" fill="#404041" />
          </svg>
        </div>

        {/* Sparks */}
        <div className="absolute animate-sparks z-20 flex items-center justify-center w-32 h-32">
          {/* North East */}
          <div className="absolute w-2 h-2 bg-primary animate-pulse translate-x-12 -translate-y-12 rotate-45" />
          <div className="absolute w-1.5 h-3 bg-orange-600 translate-x-16 -translate-y-8 rotate-12" />
          {/* East */}
          <div className="absolute w-3 h-1 bg-[#a52020] translate-x-14 translate-y-2 -rotate-12" />
          {/* South East */}
          <div className="absolute w-2 h-2 bg-primary translate-x-10 translate-y-12 rotate-45" />
          {/* South West */}
          <div className="absolute w-1.5 h-1.5 bg-orange-500 -translate-x-10 translate-y-10 rotate-12" />
          {/* West */}
          <div className="absolute w-2 h-1 bg-[#8B1A1A] -translate-x-14 translate-y-0 rotate-45" />
          {/* North West */}
          <div className="absolute w-2 h-2 bg-primary -translate-x-12 -translate-y-10 rotate-45" />
          <div className="absolute w-1 h-3 bg-red-600 -translate-x-8 -translate-y-14 -rotate-12" />
          
          {/* Central Burst */}
          <div className="absolute w-full h-full bg-primary/20 rounded-full blur-xl scale-150" />
        </div>
      </div>

      <h1 className="animate-text mt-8 text-4xl font-black text-primary drop-shadow-[0_0_15px_rgba(139,26,26,0.6)] uppercase">
        Netherite
      </h1>
    </div>
  )
}
