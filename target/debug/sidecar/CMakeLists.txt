cmake_minimum_required(VERSION 3.16)
project(ct2-server VERSION 1.0.0 LANGUAGES CXX)

# ─── C++ Standard ───────────────────────────────────────────
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ─── Dependencias ───────────────────────────────────────────

# nlohmann/json — parse/generate JSON
find_package(nlohmann_json CONFIG REQUIRED)

# CTranslate2 — neural machine translation
# Busca en ubicaciones estándar y también en el directorio de Python site-packages
find_package(ctranslate2 CONFIG QUIET)

if(NOT ctranslate2_FOUND)
    # Fallback: buscar en directorio de instalación de Python
    if(WIN32)
        # Buscar en Python site-packages (pip install ctranslate2)
        execute_process(
            COMMAND python -c "import ctranslate2; import os; print(os.path.dirname(ctranslate2.__file__))"
            OUTPUT_VARIABLE CT2_PYTHON_DIR
            OUTPUT_STRIP_TRAILING_WHITESPACE
            ERROR_QUIET
        )
        if(CT2_PYTHON_DIR)
            set(CT2_INCLUDE_DIR "${CT2_PYTHON_DIR}/include")
            if(EXISTS "${CT2_INCLUDE_DIR}/ctranslate2/translator.h")
                set(ctranslate2_INCLUDE_DIRS "${CT2_INCLUDE_DIR}")
                # Buscar la biblioteca en el directorio de Python
                file(GLOB_RECURSE CT2_LIB_FILES "${CT2_PYTHON_DIR}/../libs/ctranslate2*.lib" "${CT2_PYTHON_DIR}/../libs/libctranslate2*")
                if(CT2_LIB_FILES)
                    list(GET CT2_LIB_FILES 0 CT2_LIB_PATH)
                    get_filename_component(CT2_LIB_DIR "${CT2_LIB_PATH}" DIRECTORY)
                    set(ctranslate2_LIBRARY_DIRS "${CT2_LIB_DIR}")
                endif()
            endif()
        endif()
    elseif(APPLE)
        # macOS: buscar en Homebrew
        set(CT2_HOMEBREW_DIR "/opt/homebrew/opt/ctranslate2")
        if(EXISTS "${CT2_HOMEBREW_DIR}")
            set(ctranslate2_INCLUDE_DIRS "${CT2_HOMEBREW_DIR}/include")
            set(ctranslate2_LIBRARY_DIRS "${CT2_HOMEBREW_DIR}/lib")
        endif()
    else()
        # Linux: buscar en ubicaciones estándar
        foreach(DIR /usr /usr/local /opt/ctranslate2)
            if(EXISTS "${DIR}/include/ctranslate2/translator.h")
                list(APPEND ctranslate2_INCLUDE_DIRS "${DIR}/include")
                list(APPEND ctranslate2_LIBRARY_DIRS "${DIR}/lib")
            endif()
        endforeach()
    endif()
endif()

# ─── Ejecutable ─────────────────────────────────────────────
add_executable(ct2-server
    ct2_server.cpp
)

# ─── Include directories ────────────────────────────────────
target_include_directories(ct2-server PRIVATE
    ${nlohmann_json_INCLUDE_DIRS}
    ${ctranslate2_INCLUDE_DIRS}
)

# ─── Link libraries ─────────────────────────────────────────
target_link_libraries(ct2-server PRIVATE
    nlohmann_json::nlohmann_json
)

if(ctranslate2_FOUND)
    target_link_libraries(ct2-server PRIVATE
        ctranslate2::ctranslate2
    )
elseif(ctranslate2_LIBRARY_DIRS)
    target_link_directories(ct2-server PRIVATE ${ctranslate2_LIBRARY_DIRS})
    target_link_libraries(ct2-server PRIVATE
        ctranslate2
    )
else()
    # Si CTranslate2 no se encuentra, compilamos de todas formas
    # pero con un mensaje de advertencia. El código usará CTranslate2
    # solo si está disponible.
    message(WARNING "
    ╔══════════════════════════════════════════════════════════════╗
    ║  CTranslate2 NO encontrado.                               ║
    ║                                                            ║
    ║  Compilando ct2-server SIN soporte de traducción real.     ║
    ║  Para traducción funcional, instala CTranslate2:           ║
    ║                                                            ║
    ║  Windows (vcpkg):                                          ║
    ║    vcpkg install ctranslate2                               ║
    ║                                                            ║
    ║  Linux (apt):                                              ║
    ║    apt install libctranslate2-dev                          ║
    ║                                                            ║
    ║  macOS (Homebrew):                                         ║
    ║    brew install ctranslate2                                ║
    ║                                                            ║
    ║  Python (cualquier SO):                                    ║
    ║    pip install ctranslate2                                 ║
    ╚══════════════════════════════════════════════════════════════╝
    ")
endif()

# ─── Compiler flags ─────────────────────────────────────────
if(MSVC)
    target_compile_options(ct2-server PRIVATE /W4 /utf-8)
else()
    target_compile_options(ct2-server PRIVATE -Wall -Wextra -Wpedantic)
endif()

# ─── Post-build: copiar al directorio sidecar/ ──────────────
# La salida va a build/Release/ o build/Debug/
# El usuario debe copiar manualmente al directorio sidecar/
# (los scripts build_sidecar.ps1/build_sidecar.sh lo hacen automáticamente)

# ─── Install ────────────────────────────────────────────────
install(TARGETS ct2-server RUNTIME DESTINATION bin)
