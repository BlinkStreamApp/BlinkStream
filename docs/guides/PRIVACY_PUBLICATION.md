# Publicación de la política de privacidad

Revisión técnica: 2026-10-14. Documento fuente: [PRIVACY.md](../../PRIVACY.md).

## Antes de enviarla a Microsoft Store

- Confirmar que APX Studio identifica adecuadamente al responsable legal; completar su identidad y datos adicionales exigibles en su jurisdicción. El nombre comercial por sí solo puede no bastar.
- Confirmar que el correo `contacto.apxstudio@gmail.com` está operativo y que se pueden tramitar solicitudes de acceso/eliminación, incluida la cuenta técnica en Supabase.
- Revisar la infraestructura realmente desplegada: región, proveedores, bases jurídicas, contratos y garantías de transferencias cuando correspondan, retención de logs, credenciales temporales y backups. No se han verificado esos parámetros con esta revisión del código.
- Verificar que el paquete concreto para la Store coincide con las funciones descritas; las funciones locales de 1.5 no están publicadas y se describen solo como disponibles según versión.
- Revisar el texto legalmente antes de presentarlo; esta revisión técnica no certifica cumplimiento normativo ni aceptación de Microsoft.
- Publicar el documento en una URL HTTPS pública, estable y accesible sin sesión. Crear el archivo local no publica una URL. Comprobar el enlace desde una sesión sin autenticar antes de introducirlo en Partner Center.
- Dar acceso a la política desde la aplicación, preferiblemente antes de conectar Twitch, y desde la web/ficha de Store. El enlace interno aún no se ha implementado en este cambio documental.
- No subir los cambios locales de 1.5 o latencia como parte de una publicación documental accidental.

## Referencia de Microsoft

La sección 10.5.1 de las [políticas de Microsoft Store](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies#105-personal-information) exige informar sobre los datos, uso, almacenamiento, seguridad, destinatarios y controles del usuario. Revisar la versión y fecha de entrada en vigor al realizar el envío.

## Mantenimiento

Página pública prevista: `https://blinkstreamapp.github.io/BlinkStream/privacy.html`.
Generar la página desde la fuente con `node scripts/build-privacy-page.mjs` y comprobar
su sincronización con `node scripts/build-privacy-page.mjs --check`. No editar el HTML generado.

Actualizar la fecha y revisar PRIVACY.md cuando cambien los datos enviados, las funciones, la retención o los proveedores; no basta con cambiar la versión de la aplicación. No declarar que los tokens solo existen localmente: el backend OAuth interviene en el intercambio de autenticación.
