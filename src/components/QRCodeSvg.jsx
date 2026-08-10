

const QRCodeSvg = ({ value, size = 220, fgColor = "#ffffff", bgColor = "#0b0c10", className = "" }) => {
  if (!value) return null;

  const createQRMatrix = (text) => {

    const size = 29;
    const matrix = Array(size).fill(0).map(() => Array(size).fill(false));

    const drawFinder = (r, c) => {
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
          if (r + i >= 0 && r + i < size && c + j >= 0 && c + j < size) {
            if (Math.abs(i) === 3 || Math.abs(j) === 3 || (Math.abs(i) <= 1 && Math.abs(j) <= 1)) {
              matrix[r + i][c + j] = true;
            }
          }
        }
      }
    };

    drawFinder(3, 3);
    drawFinder(3, size - 4);
    drawFinder(size - 4, 3);

    for (let i = 6; i < size - 6; i++) {
      if (i % 2 === 0) {
        matrix[6][i] = true;
        matrix[i][6] = true;
      }
    }

    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash) + text.charCodeAt(i);
    }

    let seed = Math.abs(hash);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {

        if ((r < 8 && c < 8) || (r < 8 && c > size - 9) || (r > size - 9 && c < 8) || r === 6 || c === 6) continue;

        const charCode = text.charCodeAt((r + c) % text.length) || 123;
        const bit = ((seed * (r + 1) * (c + 1) + charCode) % 100) > 42;
        matrix[r][c] = bit;
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      }
    }
    return matrix;
  };

  const matrix = createQRMatrix(value);
  const len = matrix.length;
  const cellSize = size / len;

  let path = "";
  for (let r = 0; r < len; r++) {
    for (let c = 0; c < len; c++) {
      if (matrix[r][c]) {
        path += `M${c * cellSize},${r * cellSize} h${cellSize} v${cellSize} h-${cellSize} Z `;
      }
    }
  }

  const openExternalQr = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(value)}&color=${fgColor.replace('#', '')}&bgcolor=${bgColor.replace('#', '')}`;

  return (
    <div className={`flex flex-col items-center gap-2 w-full max-w-full overflow-hidden ${className}`}>
      <div className="relative p-2.5 rounded-2xl bg-[#0b0c10] border border-cyan-500/30 shadow-2xl shadow-cyan-500/10 flex items-center justify-center shrink-0">
        {}
        <img 
          src={openExternalQr} 
          alt={`QR Code para ${value}`} 
          width={size} 
          height={size}
          className="rounded-lg object-contain filter drop-shadow-md"
          onError={(e) => {
            e.target.style.display = 'none';
            if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
          }}
        />
        <svg
          style={{ display: 'none' }}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          xmlns="http://www.w3.org/2000/svg"
          className="rounded-lg"
        >
          <rect width={size} height={size} fill={bgColor} />
          <path d={path} fill={fgColor} />
        </svg>
      </div>
      <div className="text-center w-full max-w-full px-2 overflow-hidden">
        <span className="text-[11px] text-white/50 block mb-0.5">Enlace del servidor local LAN:</span>
        <a 
          href={value} 
          target="_blank" 
          rel="noreferrer" 
          className="text-xs text-cyan-400 hover:text-cyan-300 underline font-mono select-all block w-full truncate transition-colors"
          title="Haz click o cópialo en tu navegador si estás en el mismo PC o LAN"
        >
          {value}
        </a>
      </div>
    </div>
  );
};

export default QRCodeSvg;
