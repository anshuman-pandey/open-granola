<p align="center">
  <img src="../assets/logo.svg" width="72" alt="Logotipo de Open Granola" />
</p>

<h1 align="center">Open Granola</h1>

<p align="center">
  <strong>Transcripciones locales. La IA que elijas para tus notas de reuniones.</strong><br/>
  Un cuaderno de reuniones de escritorio con licencia Apache-2.0, creado con Tauri, React y Rust.
</p>

<p align="center">
  <a href="#try-the-preview">Probar la versión preliminar</a> ·
  <a href="#models-and-connections">Modelos</a> ·
  <a href="../ARCHITECTURE.md">Arquitectura</a> ·
  <a href="../../PRIVACY.md">Privacidad</a> ·
  <a href="../COMPETITIVE_RESEARCH.md">Investigación y prioridades</a>
</p>

[English](../../README.md) · [हिन्दी](README.hi.md) · **Español** · [Contribuir a las traducciones](../I18N.md)

<!-- English source: README.md at 6127b7f34b2e3ea786481953cfe57a7179a214c6; reviewed 2026-10-10. -->

**Versión preliminar en desarrollo.** Open Granola graba el micrófono, transcribe con Whisper en tu dispositivo y convierte la transcripción en notas mediante un modelo local o un proveedor que conectes. Tu biblioteca permanece en una base de datos SQLite local. Los resúmenes en la nube envían el texto de la transcripción al proveedor seleccionado.

La captura de audio del sistema no está implementada: esta versión no graba la voz de la otra parte de una llamada que escuchas por auriculares. Todavía falta probar de principio a fin las sesiones reales de micrófono y modelos, las cuentas de proveedores y las versiones empaquetadas en el hardware previsto. La vista previa del navegador utiliza reuniones de ejemplo identificadas como tales.

## Funciones implementadas

- **Transcripción del micrófono:** `whisper.cpp` local, segmentos con marcas de tiempo y una transcripción visible en directo.
- **Selección del proveedor de resúmenes:** Qwen integrado, LM Studio, OpenAI API, Claude API, endpoints personalizados compatibles con OpenAI y la opción experimental Sign in with ChatGPT.
- **Prueba de conexión:** una solicitud con texto sintético comprueba el modelo de resúmenes seleccionado sin enviar una reunión. No prueba la captura del micrófono ni Whisper.
- **Recuperación de reuniones guardadas:** la transcripción se guarda antes de generar el resumen. Si el resumen falla, puedes reintentarlo sin volver a grabar. Al regenerar las notas se conservan los identificadores de las tareas existentes y su estado de finalización.
- **Detalles del procesamiento:** cada reunión guardada registra la ruta de modelo/proveedor configurada y el estado del resumen, para que los cambios posteriores de configuración no oculten cómo se generó la nota.
- **Biblioteca local:** búsqueda por palabras clave, preguntas sobre texto recuperado, tareas, compromisos, instrucciones en Markdown, importación JSON y exportación Markdown.
- **Controles de conservación:** elimina reuniones caducadas o toda la biblioteca local. Consulta sus límites en [Privacidad](../../PRIVACY.md).

Las notas y los compromisos generados necesitan revisión. No están implementados la identificación de hablantes, la búsqueda semántica/vectorial, la integración de calendario, las importaciones directas desde servicios de reuniones específicos, la reproducción de audio cifrado ni la captura nativa del audio del sistema.

<a id="models-and-connections"></a>

## Modelos y conexiones

Transcribir y resumir son tareas distintas. **Actualmente, grabar requiere Whisper local con cualquier proveedor de resúmenes.** Esta versión no ofrece una API de transcripción en la nube.

| Ruta del resumen | Configuración | Qué envía Open Granola |
|---|---|---|
| Qwen local integrado | Instala `qwen3-4b-q4.gguf` | Ninguna solicitud a un proveedor |
| LM Studio | Inicia su servidor compatible con OpenAI; usa `http://127.0.0.1:1234/v1` y el ID del modelo cargado | Texto a un servidor en este dispositivo |
| OpenAI API | Tu clave API y un ID de modelo compatible | Texto a OpenAI; se aplica la facturación de la API |
| Claude API | Tu clave API de Anthropic y el ID del modelo | Texto a Anthropic; se aplica la facturación de la API |
| Compatible con OpenAI | URL base compatible, ID del modelo y clave opcional; por ejemplo, un servidor Ollama local | Texto al servidor configurado |
| Plan de ChatGPT — experimental | Elige **Continue with ChatGPT**, autoriza el uso de un plan apto y selecciona un modelo | Texto a OpenAI mediante el plan autorizado |

La ruta de ChatGPT utiliza el [flujo oficial de inicio de sesión para aplicaciones locales y de código abierto](https://developers.openai.com/siwc/token-sharing-open-source). No da acceso a tus conversaciones existentes de ChatGPT. Los requisitos de acceso y los modelos disponibles dependen de la cuenta y del proveedor. Esta integración todavía no se ha verificado de principio a fin con una cuenta real. Aquí admite solicitudes de texto; [la versión preliminar no admite transcripción de audio](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Claude se conecta con una clave API; esta aplicación no permite iniciar sesión con una cuenta de consumidor de Claude. Las claves de OpenAI API y el inicio de sesión con un plan de ChatGPT son rutas distintas.

### Conectar un modelo de resúmenes

Guías de configuración: [LM Studio](../integrations/LM_STUDIO.md) · [Ollama](../integrations/OLLAMA.md).

1. Abre **Settings → Models & connections** en la aplicación de escritorio.
2. Elige un proveedor e introduce el ID exacto de su modelo. Para un servidor personalizado, introduce la URL base de la API que indique su documentación.
3. Para ChatGPT, conecta tu cuenta y usa **Load available models**, o introduce un ID de modelo disponible para tu cuenta. Si el destino está fuera del dispositivo, activa la opción que permite enviarle texto. Esto también incluye las notas guardadas relevantes que utilicen el asistente y las instrucciones reutilizables.
4. Guarda la configuración y ejecuta **Test connection**.
5. Graba una sesión corta con el micrófono y verifica su transcripción y sus notas antes de utilizar una sesión más larga.

Los endpoints remotos requieren HTTPS; HTTP sin cifrar solo se acepta para direcciones IP de bucle local escritas explícitamente, como `127.0.0.1`. Usa la dirección anterior para LM Studio. Hay que probar la compatibilidad de los servidores personalizados: la etiqueta «compatible con OpenAI» no garantiza que todos los endpoints admitan los mismos campos. Si un modelo falla, no se cambia automáticamente del procesamiento local a la nube.

Las claves se gestionan en código nativo y se guardan en el almacén de credenciales del sistema operativo cuando está disponible. Si este no puede guardarlas, la aplicación las mantiene solo en la memoria de la sesión y muestra ese estado. Las credenciales no se guardan en la base de datos de reuniones ni en el almacenamiento del navegador. Un servidor local puede reenviar solicitudes; su configuración determina qué sucede después de recibir el texto de Open Granola.

<a id="try-the-preview"></a>

## Probar la versión preliminar

### Espacio de trabajo en el navegador

```sh
git clone https://github.com/anshuman-pandey/open-granola.git
cd open-granola
npm ci
npm run dev
```

El espacio de trabajo del navegador muestra reuniones de ejemplo. No graba audio, no ejecuta inferencia nativa ni guarda credenciales de proveedores.

### Compilación de desarrollo para escritorio

Instala Rust **1.98 o posterior**, Node **22.12 o posterior** (se recomienda Node 24 LTS), CMake, libclang, un compilador de C/C++ y los [requisitos de Tauri para tu plataforma](https://v2.tauri.app/start/prerequisites/). Linux también necesita las dependencias de desarrollo de ALSA, WebKitGTK y PipeWire según la configuración del proyecto. El paquete de macOS está dirigido a macOS 14.4 o posterior. La configuración de compilación de una plataforma no implica que se hayan completado sus pruebas de hardware.

```sh
npm ci
npm run tauri dev
```

Los hooks de Tauri compilan el proceso auxiliar de inferencia local antes de iniciar la aplicación. Para generar un paquete de distribución:

```sh
npm run tauri build
```

Los archivos generados están en `src-tauri/target/release/bundle`. La firma, la notarización y las pruebas de instalación y actualización son tareas de publicación independientes. Publica los archivos verificados en [Releases](https://github.com/anshuman-pandey/open-granola/releases) cuando estén listos; este README no promete un instalador ya compilado.

### Instalar modelos locales

Settings muestra la carpeta real de modelos: `<app-data>/library/models/`.

- Instala un modelo Whisper compatible con el nombre **`whisper-large-v3-turbo.bin`** para grabar audio.
- Instala un modelo GGUF compatible con el nombre **`qwen3-4b-q4.gguf`** solo si vas a usar el modelo de resúmenes integrado.
- Con LM Studio o un modelo de resúmenes en la nube, Whisper sigue siendo necesario, pero el archivo de Qwen integrado no lo es.

La instalación de modelos es manual. La aplicación no descarga archivos, no reanuda descargas ni verifica las sumas de comprobación del editor por ti. Obtén los modelos de una fuente de confianza y comprueba su formato y licencia. Los archivos ausentes o no válidos producen errores de configuración.

## Cómo se procesa una reunión

```text
Micrófono → Whisper local → transcripción guardada localmente
                                      ↓
                      modelo local/de servidor/en la nube elegido
                                      ↓
                            notas, tareas, compromisos
```

Las notas, las transcripciones y los detalles del procesamiento se guardan localmente, sin cifrado de la base de datos a nivel de aplicación. Si el resumen falla después de guardar la transcripción, reintenta la reunión guardada. Esta función no recupera una captura que aún estuviera en memoria cuando se cierre inesperadamente la aplicación. El audio se mantiene en RAM y no se escribe intencionadamente en un archivo de grabación.

## La privacidad, en términos sencillos

- Los modelos locales son la opción predeterminada. Procesar texto fuera del dispositivo requiere configurar un proveedor y dar consentimiento.
- La red nativa está habilitada para los proveedores y el inicio de sesión de ChatGPT. Esta versión **no tiene un aislamiento de red impuesto por el sistema operativo**.
- El webview se limita a los recursos incluidos en el paquete y a la comunicación IPC local de la aplicación. Las solicitudes a proveedores se ejecutan en código nativo.
- La aplicación no incorpora telemetría ni un servicio de sincronización en la nube de Open Granola. Los proveedores conectados tienen sus propias políticas de datos.
- Eliminar registros locales no borra los datos que conserve un proveedor, los archivos exportados, las instantáneas del sistema operativo ni las copias de seguridad.

Consulta [PRIVACY.md](../../PRIVACY.md) y [SECURITY.md](../../SECURITY.md) para conocer los detalles de almacenamiento, credenciales, red y eliminación.

## Próximas prioridades

La [revisión de alternativas](../COMPETITIVE_RESEARCH.md) examinó diez repositorios grandes relacionados y otros siete productos más cercanos o de áreas próximas. Las prioridades responden a problemas recurrentes de los usuarios, en lugar de al número de funciones del README de un competidor:

1. Verificar el flujo completo del micrófono desde una instalación limpia, con modelos y cuentas reales; mejorar la configuración de modelos y el empaquetado.
2. Implementar y probar el audio del sistema, los cambios de dispositivo, la información sobre la vigencia de la señal y las grabaciones largas en una matriz de plataformas definida.
3. Vincular decisiones y tareas con pasajes de la transcripción, con revisión antes de tratar una inferencia de IA como un compromiso confirmado.
4. Añadir correcciones de vocabulario, selección explícita de idioma y procesamiento recuperable de reuniones largas.
5. Explorar el uso compartido de texto seleccionado y el acceso limitado de agentes una vez que el registro principal sea fiable.

Estas capacidades están planificadas. La investigación y las pruebas automatizadas no demuestran que la aplicación funcione con tu configuración de reuniones.

## Comprobaciones de desarrollo

```sh
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
```

Las pruebas nativas requieren los requisitos de compilación de la plataforma. Revisa la [arquitectura](../ARCHITECTURE.md), la [política de seguridad](../../SECURITY.md) y la [guía de contribución](CONTRIBUTING.es.md) antes de cambiar la captura, las credenciales o la gestión de datos.

## Licencia

[Apache-2.0](../../LICENSE). Los archivos de modelos y los proveedores externos tienen sus propias licencias y condiciones.
