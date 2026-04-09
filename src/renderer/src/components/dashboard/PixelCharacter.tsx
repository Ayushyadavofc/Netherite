interface PixelCharacterProps {
  gender?: 'male' | 'female'
  className?: string
}

export function PixelCharacter({ gender = 'male', className = '' }: PixelCharacterProps) {
  // Pure hard-edged rigid pixel grid (64x64 mapped to 192px -> 3x3 physical pixels)
  // Everything must be <rect> integer coordinates. NO smooth interpolations.
  return (
    <div className={`char-step relative z-10 h-full w-full max-h-full max-w-full overflow-hidden cursor-pointer [image-rendering:pixelated] ${className}`}>
      <svg
        viewBox="0 0 64 64"
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full max-h-full max-w-full overflow-hidden drop-shadow-2xl [shape-rendering:crispEdges]"
      >
        {/* Shadow */}
        <rect x="22" y="60" width="20" height="2" fill="#000000" opacity="0.5" />

        {/* Entire Body Container for Idle Breathing (1px Y shift) */}
        <g className="char-idle">
          
          {gender === 'male' ? (
            <>
              {/* === MALE KAZUYA STANCE (Facing Left) === */}
              {/* Left Back Leg */}
              <g>
                <rect x="34" y="36" width="6" height="15" fill="#111111" />
                <rect x="37" y="36" width="2" height="15" fill="#1e1e1e" />
                <rect x="33" y="51" width="8" height="9" fill="#0a0a0a" />
                <rect x="32" y="58" width="2" height="2" fill="#1e1e1e" />
              </g>

              {/* Right Back Arm (hidden behind back, fist poking out) */}
              <g>
                <rect x="40" y="24" width="4" height="10" fill="#a86b30" />
                <rect x="40" y="34" width="5" height="4" fill="#E63E00" /> {/* Purple hand wrap */}
                <rect x="39" y="38" width="6" height="5" fill="#000000" /> {/* Glove */}
              </g>

              {/* Torso Container (Weight shift 1px X) */}
              <g className="char-torso">
                <rect x="22" y="18" width="16" height="20" fill="#c68642" /> {/* Chest */}
                <rect x="22" y="22" width="6" height="3" fill="#a86b30" /> {/* Pecs */}
                <rect x="23" y="27" width="4" height="6" fill="#a86b30" /> {/* Abs line */}
                <rect x="35" y="18" width="3" height="20" fill="#a86b30" /> {/* Spine shadow */}
                
                {/* 3 pixel Scar on chest */}
                <rect x="20" y="20" width="1" height="1" fill="#8c5522" />
                <rect x="21" y="21" width="1" height="1" fill="#8c5522" />
                <rect x="22" y="22" width="1" height="1" fill="#8c5522" />
              </g>

              {/* Right Front Leg */}
              <g>
                <rect x="20" y="36" width="10" height="16" fill="#0f0f0f" />
                <rect x="23" y="36" width="4" height="16" fill="#1e1e1e" />
                <rect x="20" y="52" width="2" height="2" fill="#c68642" /> {/* Skin at tear */}
                <rect x="18" y="54" width="12" height="6" fill="#000000" /> {/* Boot */}
                <rect x="15" y="58" width="5" height="2" fill="#1e1e1e" /> {/* Boot toe pointing left */}
              </g>

              {/* Head Base */}
              <g className="char-torso">
                <rect x="20" y="6" width="14" height="12" fill="#c68642" />
                <rect x="21" y="14" width="10" height="4" fill="#a86b30" /> {/* Jaw shadow */}
                
                {/* Scar on cheek (3 px) */}
                <rect x="24" y="12" width="1" height="1" fill="#8c5522" />
                <rect x="25" y="13" width="1" height="1" fill="#8c5522" />
                <rect x="26" y="14" width="1" height="1" fill="#8c5522" />

                {/* Blinking Eyes */}
                <g className="char-blink">
                  <rect x="23" y="9" width="2" height="2" fill="#000000" />
                  <rect x="28" y="9" width="2" height="2" fill="#000000" />
                  <rect x="23" y="9" width="1" height="1" fill="#ffffff" />
                  <rect x="28" y="9" width="1" height="1" fill="#ffffff" />
                </g>
                
                {/* Eyebrows */}
                <rect x="22" y="7" width="4" height="1" fill="#2d1b0f" />
                <rect x="27" y="8" width="4" height="1" fill="#2d1b0f" />

                {/* Hair Kazuya Spikes */}
                <rect x="20" y="4" width="14" height="3" fill="#4a2f1a" />
                <rect x="22" y="2" width="3" height="2" fill="#4a2f1a" />
                <rect x="27" y="1" width="2" height="3" fill="#4a2f1a" />
                <rect x="31" y="0" width="3" height="4" fill="#4a2f1a" />
                <rect x="34" y="2" width="4" height="8" fill="#4a2f1a" />
                <rect x="36" y="10" width="2" height="4" fill="#4a2f1a" />
              </g>

              {/* Left Front Arm (Raised fist guarding face) */}
              <g className="char-clench">
                <rect x="14" y="18" width="6" height="8" fill="#c68642" /> {/* Shoulder */}
                <rect x="16" y="26" width="8" height="4" fill="#c68642" /> {/* Forearm raised */}
                <rect x="10" y="25" width="6" height="6" fill="#E63E00" /> {/* Purple Wrap */}
                <rect x="8" y="26" width="6" height="4" fill="#FF4500" /> {/* Glove */}
                <rect x="7" y="27" width="1" height="2" fill="#E8E8E8" /> {/* Knuckle highlight */}
              </g>
            </>
          ) : (
            <>
              {/* === FEMALE STANCE === */}
              <g>
                <rect x="34" y="36" width="6" height="15" fill="#111111" />
                <rect x="37" y="36" width="2" height="15" fill="#1e1e1e" />
                <rect x="33" y="51" width="8" height="9" fill="#0a0a0a" />
                <rect x="32" y="58" width="2" height="2" fill="#1e1e1e" />
              </g>

              <g>
                <rect x="40" y="24" width="4" height="8" fill="#1e1e1e" />
                <rect x="39" y="32" width="5" height="4" fill="#c68642" />
                <rect x="38" y="36" width="6" height="5" fill="#000000" />
              </g>

              <g className="char-torso">
                <rect x="22" y="18" width="14" height="10" fill="#FF4500" /> {/* Purple top */}
                <rect x="22" y="28" width="12" height="8" fill="#c68642" /> {/* Bare midriff */}
                <rect x="30" y="18" width="6" height="18" fill="#1e1e1e" /> {/* Jacket edge */}
              </g>

              <g>
                <rect x="20" y="36" width="10" height="16" fill="#0f0f0f" />
                <rect x="23" y="36" width="4" height="16" fill="#1e1e1e" />
                <rect x="18" y="52" width="12" height="8" fill="#000000" />
                <rect x="15" y="58" width="5" height="2" fill="#1e1e1e" />
              </g>

              <g className="char-torso">
                <rect x="20" y="6" width="12" height="11" fill="#c68642" />
                <rect x="21" y="14" width="8" height="3" fill="#a86b30" />

                <g className="char-blink">
                  <rect x="22" y="10" width="2" height="2" fill="#000000" />
                  <rect x="27" y="10" width="2" height="2" fill="#000000" />
                  <rect x="23" y="10" width="1" height="1" fill="#ffffff" />
                  <rect x="28" y="10" width="1" height="1" fill="#ffffff" />
                </g>

                <rect x="20" y="4" width="13" height="4" fill="#4a2f1a" />
                <rect x="30" y="2" width="4" height="12" fill="#4a2f1a" />
                {/* Ponytail */}
                <rect x="34" y="6" width="2" height="3" fill="#FF4500" />
                <rect x="36" y="5" width="4" height="10" fill="#4a2f1a" />
                <rect x="38" y="15" width="2" height="4" fill="#4a2f1a" />
              </g>

              <g className="char-clench">
                <rect x="14" y="18" width="6" height="8" fill="#1e1e1e" />
                <rect x="16" y="26" width="8" height="4" fill="#c68642" />
                <rect x="10" y="25" width="6" height="6" fill="#000000" />
                <rect x="8" y="26" width="6" height="4" fill="#1e1e1e" />
                <rect x="7" y="27" width="1" height="2" fill="#555555" />
              </g>
            </>
          )}

        </g>
      </svg>
    </div>
  )
}
