!macro NSIS_HOOK_PREINSTALL
  ; v1.3.1 y anteriores usaban un bootstrapper propio en esta ruta. El
  ; directorio solo contenia binarios; los datos de usuario viven fuera.
  RMDir /r "$LOCALAPPDATA\Programs\BlinkStream"
!macroend
