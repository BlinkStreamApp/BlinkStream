# Sistema de backups BlinkStream

## Convención

Antes de CADA fix o feature:
```powershell
.\scripts\backup.ps1 -Description "fix-cp-401"
```

Crea snapshot en `C:\Users\alber\Backups\BlinkStream\<timestamp>-<description>`.

## Restaurar

```powershell
.\scripts\restore.ps1 20260703-184530-fix-cp-401
```

## Listar backups

```powershell
.\scripts\list-backups.ps1
```

## Regla fundamental

NUNCA empezar un fix sin hacer backup. Si te saltas este paso y algo se rompe, no tenemos punto de restauración.
