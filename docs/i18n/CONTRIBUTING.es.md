# Contribuir a Open Granola

[English](../../CONTRIBUTING.md) · [हिन्दी](CONTRIBUTING.hi.md) · **Español** · [Guía de traducción](../I18N.md)

<!-- English source: CONTRIBUTING.md at 6127b7f34b2e3ea786481953cfe57a7179a214c6; reviewed 2026-10-10. -->

Mantén el procesamiento local como opción predeterminada y haz explícito cada destino remoto opcional. Las funciones deben explicar sus limitaciones y mostrar claramente el fallo cuando falte un modelo, un permiso o una capacidad de la plataforma.

## Participa

Son bienvenidos los informes de errores, las correcciones de documentación, las mejoras de accesibilidad y las contribuciones de código. Revisa las incidencias existentes antes de abrir una nueva. Para un cambio importante, describe primero el comportamiento y el alcance en una incidencia, para que quienes contribuyen puedan discutirlo. Consulta [SECURITY.md](../../SECURITY.md) para informar de vulnerabilidades de forma privada.

Haz un fork del repositorio, crea una rama para tu cambio y abre una pull request contra `main`. Incluye una descripción breve y las comprobaciones realizadas. Los cambios pequeños de documentación no necesitan las herramientas de compilación nativa.

Para contribuciones centradas en integraciones, consulta el [plan de colaboración con la comunidad](../COMMUNITY_GROWTH.md).

## Preparación

Usa Node 24 LTS y Rust 1.98 o posterior. Las compilaciones nativas también necesitan CMake, libclang, un compilador de C/C++ y las [dependencias de Tauri para tu plataforma](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run dev          # espacio de trabajo de ejemplo en el navegador
npm run tauri dev    # aplicación nativa; instala los modelos manualmente en la carpeta indicada en Settings
```

Consulta el [README](README.es.md) para conocer los nombres de archivo de los modelos y el comportamiento compatible.

## Reglas de ingeniería

1. La red en tiempo de ejecución debe quedar únicamente en los módulos nativos revisados `providers.rs` y `auth.rs`. Conserva la validación de endpoints, el consentimiento para enviar texto fuera del dispositivo, el bloqueo de redirecciones y proxies, los límites de las respuestas y el aislamiento de credenciales. Mantén la CSP del renderer limitada al IPC de la aplicación. No añadas analítica, envíos ocultos, recursos remotos ni cambios silenciosos a la nube. Cualquier destino nuevo necesita una revisión explícita de producto y seguridad.
2. Todas las tablas con datos deben participar en la conservación y el borrado completo de la biblioteca. Añade pruebas de regresión para cambios de esquema, migraciones, FTS y eliminación. No prometas borrado físico de SSD ni copias de seguridad.
3. Guarda las transcripciones originales antes de generar las notas mejoradas. Usa transacciones al escribir en varias tablas. No confíes en las marcas de tiempo del renderer, la estructura de salida del modelo ni el JSON importado.
4. Muestra los errores y conserva las vías de recuperación. No presentes datos de ejemplo, respuestas predefinidas ni contadores de red fijos como resultados reales del escritorio.
5. Mantén la inferencia costosa y el trabajo de audio fuera del hilo de la interfaz. Respeta el bloqueo de captura al cambiar la captura, la conservación o el borrado.

## Antes de enviar cambios

```sh
npm run check
npm audit
npm run build:worker
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

Incluye ambos archivos de bloqueo de dependencias en el commit. Describe el comportamiento, la validación y las limitaciones de plataforma pendientes en la pull request. Usa mensajes de commit convencionales y agrupa los cambios relacionados. Nunca incluyas bibliotecas de reuniones, audio, pesos de modelos, credenciales ni claves de firma en los commits.

## Próximas tareas útiles

- Implementar y probar la captura nativa del audio del sistema en cada sistema operativo.
- Añadir recuperación desde puntos de control si el proceso termina durante una captura.
- Validar la transcripción y los resúmenes de reuniones largas con modelos reales.
- Añadir paginación de la biblioteca y mediciones de rendimiento del renderizado de transcripciones largas.
- Probar la compatibilidad de modelos, la accesibilidad y los permisos de la aplicación empaquetada en hardware real.

Informa de los problemas de seguridad siguiendo [SECURITY.md](../../SECURITY.md). Sé amable y directo. Las contribuciones se publican bajo Apache-2.0.
