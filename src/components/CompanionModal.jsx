import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCodeSvg from './QRCodeSvg';
import PhosphorIcon from './icons/PhosphorIcon';

const CompanionModal = ({ onClose }) => {
  const [status, setStatus] = useState({ isRunning: false, url: '', ip: '', port: 9876, pin: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await invoke('get_companion_status');
      setStatus(res);
      setError(null);
    } catch (err) {
      console.error('Error obteniendo estado del Mando Wi-Fi:', err);
      setError('No se pudo contactar con el servidor local del Mando Wi-Fi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    invoke('get_companion_status')
      .then(res => {
        if (cancelled) return;
        setStatus(res);
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Error obteniendo estado del Mando Wi-Fi:', err);
        setError('No se pudo contactar con el servidor local del Mando Wi-Fi.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleKey = (e) => { if (e.code === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const toggleServer = async () => {
    try {
      setLoading(true);
      if (status.isRunning) {
        await invoke('stop_companion_server_cmd');
        setStatus(prev => ({ ...prev, isRunning: false }));
      } else {
        const res = await invoke('start_companion_server_cmd');
        setStatus(res);
      }
    } catch (err) {
      console.error('Error al cambiar estado del servidor:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-[440px] max-h-[calc(100vh-2.5rem)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#181b24] via-[#13151c] to-[#0f1117] rounded-3xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 text-white p-5 sm:p-6 transition-all animate-scale-up shrink-0"
        onClick={(e) => e.stopPropagation()}
      >

        {}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
          <div className="absolute -top-24 -right-24 w-52 h-52 bg-fuchsia-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        </div>

        {}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all z-10"
          title="Cerrar ventana (Escape)"
        >
          <PhosphorIcon name="X" size={20} weight="bold" />
        </button>

        {}
        <div className="flex items-center gap-3 mb-4 pr-6">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-cyan-500 to-fuchsia-500 text-white shadow-lg shadow-cyan-500/30 shrink-0">
            <PhosphorIcon name="DeviceMobile" size={26} weight="fill" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black bg-gradient-to-r from-white via-cyan-200 to-fuchsia-200 bg-clip-text text-transparent">
                Mando Wi-Fi Móvil
              </h2>
              <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide ${status.isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                {status.isRunning ? <><PhosphorIcon name="CheckCircle" size={12} weight="fill" /> Activo</> : 'Detenido'}
              </span>
            </div>
            <p className="text-[11px] text-white/60 mt-0.5 leading-tight">
              Controla y chatea en tu stream desde tu teléfono en la red LAN.
            </p>
          </div>
        </div>

        {loading && !status.url ? (
          <div className="py-12 flex flex-col items-center justify-center text-white/70">
            <PhosphorIcon name="ArrowsClockwise" size={32} className="animate-spin text-cyan-400 mb-2" />
            <p className="text-xs font-semibold">Sincronizando con servidor LAN...</p>
          </div>
        ) : error ? (
          <div className="py-8 px-4 text-center bg-rose-500/10 border border-rose-500/30 rounded-2xl my-3">
            <p className="text-rose-400 font-bold text-xs mb-2">⚠️ {error}</p>
            <button
              onClick={fetchStatus}
              className="mt-2 px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-all"
            >
              Reintentar Conexión
            </button>
          </div>
        ) : (
          <>
            {}
            <div className="bg-black/40 border border-white/5 rounded-2xl p-4 mb-4 flex flex-col items-center justify-center shadow-inner">
              {status.isRunning ? (
                <>
                  <QRCodeSvg value={status.url} size={155} className="mb-3" />

                  <div className="flex items-center justify-center flex-wrap gap-x-2.5 gap-y-1 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 text-[11px] text-white/80 font-mono w-full max-w-full">
                    <span className="flex items-center gap-1 text-cyan-400 font-bold truncate">
                      <PhosphorIcon name="WifiHigh" size={14} weight="bold" /> {status.ip}:{status.port}
                    </span>
                    <span className="text-white/30 hidden sm:inline">|</span>
                    <span className="flex items-center gap-1 text-fuchsia-400 font-bold truncate" title="Código PIN para evitar accesos no autorizados en redes compartidas">
                      <PhosphorIcon name="ShieldCheck" size={15} weight="bold" /> PIN: {status.pin}
                    </span>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center">
                  <PhosphorIcon name="Power" size={40} className="text-white/30 mx-auto mb-2" />
                  <p className="text-white/70 font-semibold text-xs mb-2">El servidor del Mando Remoto está en reposo.</p>
                  <button
                    onClick={toggleServer}
                    disabled={loading}
                    className="mt-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-black text-xs uppercase tracking-wide shadow-lg shadow-cyan-500/30 hover:scale-105 transition-all"
                  >
                    🚀 Activar Servidor Ahora
                  </button>
                </div>
              )}
            </div>

            {}
            <div className="space-y-1.5 text-[11px] text-white/80 bg-white/5 p-3.5 rounded-2xl border border-white/10 mb-4 leading-relaxed">
              <h4 className="font-bold text-cyan-300 text-xs mb-1 flex items-center gap-1">
                📋 Guía Rápida de Conexión:
              </h4>
              <p className="flex items-start gap-1.5">
                <span className="font-bold text-fuchsia-400 shrink-0">1.</span>
                <span>Conecta tu teléfono al <b>mismo Wi-Fi</b> que este PC.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="font-bold text-fuchsia-400 shrink-0">2.</span>
                <span>Escanea el <b>Código QR</b> con la cámara o Google Lens.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="font-bold text-fuchsia-400 shrink-0">3.</span>
                <span>Controla volumen, cambia de stream y chatea desde la palma de tu mano sin usar el PC.</span>
              </p>
            </div>

            {}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px]">
              <span className="text-white/50 truncate pr-2">
                🔒 Sesión cifrada y protegida
              </span>
              {status.isRunning && (
                <button
                  onClick={toggleServer}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-400 border border-white/15 hover:border-rose-500/40 text-[11px] font-bold transition-all flex items-center gap-1 shrink-0"
                >
                  <PhosphorIcon name="Power" size={13} weight="bold" /> Detener
                </button>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default CompanionModal;
