# Política de privacidad de BlinkStream

Última actualización: 14 de octubre de 2026.

## 1. Editor y contacto

BlinkStream es una aplicación de escritorio desarrollada y publicada por **APX Studio**. Permite acceder a contenido de Twitch, reproducir directos, utilizar el chat y otras funciones relacionadas.

Para consultas sobre privacidad o solicitudes relativas a tus datos, escribe a **[contacto.apxstudio@gmail.com](mailto:contacto.apxstudio@gmail.com)**.

Esta política describe el tratamiento de datos realizado para prestar las funciones de BlinkStream. Twitch, Microsoft y los demás servicios externos tienen sus propias políticas para el tratamiento que realizan de forma independiente. BlinkStream no es un producto oficial de Twitch.

## 2. Datos que se utilizan y para qué

Solo se utilizan las categorías de datos relacionadas con las funciones que empleas:

| Categoría | Datos y finalidad | Tratamiento |
| --- | --- | --- |
| Cuenta y autenticación | Identificadores, nombre de usuario y perfil de Twitch, permisos concedidos y credenciales de sesión. Permiten iniciar sesión, consultar tu cuenta y ejecutar acciones autorizadas. | Twitch, backend de autenticación alojado en Supabase y dispositivo. |
| Favoritos y canales seguidos | Canales que marcas como favoritos y canales seguidos consultados en Twitch. Permiten mostrar y actualizar tus listas. | Los favoritos de BlinkStream se sincronizan con Supabase asociados a tu cuenta. Los follows se consultan en Twitch; no se convierten automáticamente en favoritos en la nube. |
| Reproducción y navegación | Canal, categoría o vídeo solicitado, calidad elegida y datos técnicos de reproducción. Permiten obtener y reproducir el contenido, recuperar errores y mostrar estadísticas. | Dispositivo y servicios de Twitch/distribución del vídeo. |
| Chat y acciones del canal | Mensajes recibidos o enviados, nombres de usuario, insignias y eventos; acciones de moderación o del creador cuando están autorizadas. | Dispositivo y Twitch. Los mensajes que envías se entregan al canal elegido y pueden ser públicos. |
| Drops | Campañas, recompensas, progreso y solicitudes de reclamo. Si activas el reporte nativo experimental, identificadores de usuario, canal, emisión y juego, fecha, reproducción medida y estado de silencio. | Twitch y dispositivo. El reporte de visionado se envía a Twitch, no a una base de datos de estadísticas de APX Studio. |
| Preferencias y archivos locales | Ajustes de interfaz, idioma, audio y calidad; canales recientes y otras preferencias disponibles en tu versión. Capturas, grabaciones y clips que decides crear. | Dispositivo. Las grabaciones y capturas no se suben automáticamente a APX Studio. |
| Diagnóstico y seguridad | Errores, fechas, resultados de solicitudes y datos de conexión. El backend puede registrar dirección IP, origen de la solicitud, identificador de cuenta y canal asociado a una operación fallida. | Dispositivo y proveedores de infraestructura, para funcionamiento, seguridad y resolución de incidencias. |

Las colecciones, sus portadas y las preferencias de categorías, cuando estén disponibles en la versión instalada, se guardan localmente. No se sincronizan con Supabase como los favoritos.

BlinkStream utiliza autorizaciones de Twitch: no solicita que entregues tu contraseña de Twitch a APX Studio. Las credenciales OAuth y de sesión sí se procesan para mantener la conexión y las funciones autorizadas.

## 3. Funciones opcionales y permisos

- **Inicio de sesión:** eliges conectar tu cuenta y conceder los permisos que muestra Twitch. Algunas funciones no están disponibles sin esa autorización.
- **Chat, moderación y reclamos:** solo se realizan las acciones que solicitas o las automatizaciones que habilitas. El servicio receptor puede conservarlas conforme a sus reglas.
- **Reporte experimental de Drops:** puedes activarlo o desactivarlo en la aplicación. Su finalidad es comunicar a Twitch reproducción real; una respuesta aceptada no garantiza crédito de recompensas.
- **Grabaciones y capturas:** se crean en el dispositivo cuando utilizas esas funciones. Pueden contener nombres, mensajes u otros datos de personas que aparecen en el contenido. Antes de compartirlos, considera su privacidad y los derechos sobre el contenido.
- **Mando Wi-Fi / Companion:** al activarlo, BlinkStream ofrece un servicio en tu red local. Un dispositivo conectado y autorizado puede recibir información de la reproducción y utilizar los controles disponibles, incluido enviar mensajes al chat. El acceso se protege mediante un PIN; no lo compartas y evita exponer el servicio a Internet.

## 4. Servicios externos y destinatarios

Los datos necesarios para cada función se comunican a los siguientes servicios:

- **Twitch y sus redes de distribución:** autenticación, perfil, follows, vídeo, chat, eventos y Drops.
- **Supabase:** infraestructura de autenticación de BlinkStream, cuenta técnica vinculada a tu identidad de Twitch, sincronización de favoritos y registros operativos. La cuenta técnica puede usar un identificador con formato de correo generado a partir del login; no implica que hayas facilitado un correo personal.
- **Proveedores de emotes e insignias**, como 7TV, BetterTTV y FrankerFaceZ: consultas de recursos de chat y descarga de imágenes. Pueden recibir la IP y los identificadores necesarios para obtener recursos de un canal.
- **GitHub:** alojamiento de la web y de los archivos de actualización en las distribuciones que utilizan GitHub Releases. Las consultas y descargas generan datos de conexión para ese servicio.
- **Microsoft:** distribución e instalación mediante Microsoft Store y componentes de Windows, según sus propias condiciones y opciones de privacidad.

Las conexiones a servicios externos revelan normalmente tu dirección IP y metadatos técnicos, incluso si no inicias sesión. Las vistas oficiales integradas de Twitch pueden utilizar cookies y almacenamiento de sesión propios de Twitch.

BlinkStream no incorpora un sistema propio de venta de datos personales ni de publicidad personalizada. Esto no significa que Twitch u otros servicios externos carezcan de cookies, registros o tratamientos propios.

Los proveedores pueden tratar datos en países distintos del tuyo. La ubicación depende del servicio y de su configuración; no se garantiza que todos los datos permanezcan en un único país. Puedes solicitar información sobre el tratamiento gestionado por APX Studio utilizando el contacto de esta política.

## 5. Almacenamiento y seguridad

La aplicación mantiene ajustes y cachés en el almacenamiento local de su entorno de escritorio. Para los secretos que gestiona mediante su capa nativa utiliza el almacén de credenciales del sistema operativo. Las páginas oficiales integradas mantienen su propia sesión y cookies.

El backend participa en el intercambio de credenciales OAuth y en la creación o renovación de sesiones. Las conexiones con los servicios remotos utilizan transporte cifrado cuando el servicio lo proporciona. Se aplican controles de autenticación y acceso para las operaciones de cuenta y favoritos.

Ningún sistema ofrece seguridad absoluta. Protege tu cuenta, tu dispositivo y el PIN del mando; no envíes contraseñas, tokens ni cookies en solicitudes de soporte. El servicio de mando local no debe tratarse como un canal seguro para redes públicas o no confiables.

## 6. Conservación de los datos

- Las preferencias y archivos locales pueden permanecer hasta que los elimines o borres los datos de la aplicación. Desinstalar no implica necesariamente borrar grabaciones, capturas u otros archivos guardados fuera de la carpeta de la aplicación.
- Los favoritos sincronizados permanecen asociados a la cuenta para su recuperación en otros dispositivos. Puedes eliminar favoritos desde la aplicación o solicitar la eliminación de los datos de cuenta gestionados por APX Studio.
- Las credenciales, los datos temporales de autenticación y los registros técnicos se utilizan para prestar el servicio y atender necesidades operativas y de seguridad. Su conservación depende de su finalidad y de la configuración de la infraestructura, incluidas las copias de seguridad.
- Los mensajes, las acciones y el contenido entregados a Twitch u otros servicios están sujetos a la conservación de esos servicios.

Cerrar sesión no equivale a solicitar la eliminación de la cuenta en la nube ni de los datos que conservan terceros. Las preferencias locales por cuenta pueden conservarse para posteriores sesiones sin mostrarse a otra cuenta.

## 7. Tus controles y derechos

Puedes cerrar sesión, desactivar funciones opcionales, eliminar favoritos y gestionar los archivos que has creado. Para retirar los permisos de Twitch, utiliza la gestión de conexiones de tu cuenta de Twitch.

Para acceder, corregir o solicitar la eliminación de datos gestionados por APX Studio, escribe a **contacto.apxstudio@gmail.com** e indica tu nombre de usuario de Twitch y el objeto de la solicitud. Podemos pedir una comprobación proporcionada de identidad para evitar que otra persona actúe sobre tu cuenta. No envíes contraseñas, tokens ni documentos de identidad salvo que se acuerde un medio adecuado y sean realmente necesarios.

Según la legislación aplicable, puedes tener derechos de acceso, rectificación, supresión, oposición, limitación, portabilidad y retirada del consentimiento. La retirada no afecta al tratamiento anterior lícito. También puedes presentar una reclamación ante la autoridad de protección de datos competente. Las solicitudes se atenderán conforme a los requisitos y plazos legales aplicables.

Las solicitudes relativas a datos tratados de forma independiente por Twitch, Microsoft u otros proveedores deben dirigirse también a esos proveedores. Borrar datos de BlinkStream no elimina una cuenta de Twitch ni los mensajes ya enviados.

## 8. Menores de edad

BlinkStream no está dirigido a menores que no puedan utilizar Twitch conforme a sus condiciones y a la legislación aplicable. El uso de la aplicación no sustituye los requisitos de edad o autorización parental de los servicios externos. Si consideras que se han tratado datos de un menor de forma indebida, contacta con APX Studio.

## 9. Cambios de esta política

Esta política se actualizará cuando cambien las funciones o el tratamiento de datos. La fecha del encabezado identifica la última revisión. Cuando corresponda, los cambios relevantes se comunicarán y se solicitará una nueva autorización antes de iniciar un tratamiento que la requiera.

## 10. Contacto de privacidad

**APX Studio** · **[contacto.apxstudio@gmail.com](mailto:contacto.apxstudio@gmail.com)**.

No publiques información personal, credenciales ni solicitudes de eliminación de cuenta en los issues públicos del repositorio.
