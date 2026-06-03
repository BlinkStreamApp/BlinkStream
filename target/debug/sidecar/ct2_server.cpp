/*
 * ct2_server.cpp — CTranslate2 NMT sidecar for BlinkStream
 *
 * RF-14:   CTranslate2 como subproceso gestionado con protocolo JSON stdin/stdout
 * RNF-14:  Independencia de toolchain Rust — comunicación mediante JSON IPC
 * §4.4:    Protocolo de línea JSON simple por stdin/stdout
 *
 * Compilar (Windows MSVC + vcpkg):
 *   cmake -B build -S . -DCMAKE_TOOLCHAIN_FILE="C:/vcpkg/scripts/buildsystems/vcpkg.cmake"
 *   cmake --build build --config Release
 *   copy build\Release\ct2-server.exe ..
 *
 * Compilar (Linux/macOS):
 *   cmake -B build -S .
 *   cmake --build build --config Release
 *   cp build/ct2-server ..
 *
 * Uso (stdin/stdout pipe):
 *   echo '{"command":"load_model","model_path":"...","src_lang":"en","tgt_lang":"es"}' | ct2-server
 *   echo '{"command":"translate","text":"Hello world","id":1}' | ct2-server
 *   echo '{"command":"ping"}' | ct2-server
 *   echo '{"command":"shutdown"}' | ct2-server
 *
 * Protocolo:
 *   stdin:  JSON lines (comandos)
 *   stdout: JSON lines (respuestas)
 *   stderr: Logs de diagnóstico (ignorados por el Rust sidecar manager)
 *
 * Comandos:
 *   {"command":"load_model","model_path":"<path>","src_lang":"<code>","tgt_lang":"<code>"}
 *   {"command":"translate","text":"<text>","id":<n>}
 *   {"command":"ping"}
 *   {"command":"shutdown"}
 *
 * Respuestas:
 *   {"status":"loaded","model":"<path>"}
 *   {"status":"ok","result":"<translated>","id":<n>}
 *   {"status":"error","message":"<desc>"}
 *   {"status":"pong"}
 *   {"status":"shutting_down"}
 */

#include <iostream>
#include <string>
#include <vector>
#include <memory>
#include <csignal>
#include <cstdlib>
#include <sstream>
#include <algorithm>
#include <cctype>

/*
 * nlohmann/json — single-header JSON library.
 *
 * Install via vcpkg:
 *   vcpkg install nlohmann-json
 *
 * Or download from: https://github.com/nlohmann/json/releases
 */
#include <nlohmann/json.hpp>

/*
 * CTranslate2 — neural machine translation C++ library.
 *
 * Install via vcpkg (recommended on Windows):
 *   vcpkg install ctranslate2[cuda]  -- para NVIDIA GPU
 *   vcpkg install ctranslate2        -- para CPU
 *
 * Or via pip + custom CMake:
 *   pip install ctranslate2
 *   set CT2_DIR=%USERPROFILE%\AppData\Local\Programs\Python\Python312\Lib\site-packages\ctranslate2
 *
 * Linux/macOS: build from source or use system package manager.
 */
#include <ctranslate2/translator.h>
#include <ctranslate2/models.h>
#include <ctranslate2/translation_result.h>

using json = nlohmann::json;

// ─── Global state ──────────────────────────────────────────

/// Flag for graceful shutdown on SIGINT/SIGTERM
static volatile sig_atomic_t g_running = 1;

void signal_handler(int) {
    g_running = 0;
}

// ─── Translator wrapper ────────────────────────────────────

/**
 * Wrapper alrededor de ctranslate2::Translator.
 *
 * Gestiona el ciclo de vida del modelo:
 *   load_model()  → carga un modelo CTranslate2 desde disco
 *   translate()   → traduce texto (tokeniza internamente con SentencePiece)
 *   is_loaded()   → verifica si hay modelo cargado
 */
class Translator {
public:
    Translator() = default;

    /**
     * Carga un modelo CTranslate2.
     *
     * @param model_path Ruta al directorio del modelo (contiene model.bin, vocabulary.json, config.json)
     * @param src_lang   Código de idioma fuente (ej. "en")
     * @param tgt_lang   Código de idioma destino (ej. "es")
     */
    void load_model(const std::string& model_path,
                    const std::string& src_lang,
                    const std::string& tgt_lang) {
        // Cargar el modelo usando CTranslate2
        auto model = ctranslate2::models::ModelLoader::load(model_path);

        // Crear el translator asociado al modelo
        m_translator = std::make_unique<ctranslate2::Translator>(model);

        m_loaded = true;
        m_src_lang = src_lang;
        m_tgt_lang = tgt_lang;

        std::clog << "[ct2_server] Model loaded: " << model_path
                  << " (" << src_lang << " -> " << tgt_lang << ")"
                  << std::endl;
    }

    /**
     * Traduce un segmento de texto.
     *
     * Tokeniza el texto de entrada usando SentencePiece (si el modelo lo incluye),
     * ejecuta la inferencia, y detokeniza el resultado.
     *
     * @param text Texto de entrada a traducir
     * @return Texto traducido
     */
    std::string translate(const std::string& text) {
        if (!m_loaded || !m_translator) {
            throw std::runtime_error(
                "No model loaded. Send load_model first."
            );
        }

        if (text.empty()) {
            return "";
        }

        // Tokenizar: split por espacios (CTranslate2 maneja BPE internamente
        // si el modelo incluye vocabulary.json con subword tokens)
        std::vector<std::string> tokens = tokenize(text);
        if (tokens.empty()) {
            return "";
        }

        // Configurar opciones de traducción
        ctranslate2::TranslationOptions options;
        options.beam_size = 4;          // Beam search width
        options.max_length = 200;       // Máximo de tokens en salida
        options.length_penalty = 1.0;   // Sin penalización de longitud
        options.sampling_topk = 1;      // Greedy decoding (determinista)

        // Ejecutar inferencia (batch de 1)
        std::vector<std::vector<std::string>> batch = {tokens};
        auto results = m_translator->translate_batch(batch, options);

        // Extraer resultado: primera hipótesis del primer batch
        if (results.empty() || results[0].hypotheses().empty()) {
            throw std::runtime_error("CTranslate2 returned empty result");
        }

        const auto& hypothesis = results[0].hypotheses()[0];
        const auto& output_tokens = hypothesis.tokens();

        // Detokenizar: unir tokens con espacio
        std::string translated = detokenize(output_tokens);

        std::clog << "[ct2_server] Translated: \""
                  << text.substr(0, 60)
                  << (text.length() > 60 ? "..." : "")
                  << "\" -> \""
                  << translated.substr(0, 60)
                  << (translated.length() > 60 ? "..." : "")
                  << "\"" << std::endl;

        return translated;
    }

    bool is_loaded() const { return m_loaded; }

private:
    bool m_loaded = false;
    std::string m_src_lang;
    std::string m_tgt_lang;
    std::unique_ptr<ctranslate2::Translator> m_translator;

    /**
     * Tokenización simple por espacios.
     *
     * NOTA: Para modelos OPUS-MT con SentencePiece, CTranslate2 maneja
     * internamente la tokenización BPE si el vocabulario está presente.
     * Esta función hace un split básico como entrada a CTranslate2.
     *
     * Para una tokenización más precisa, el modelo debe incluir un
     * SentencePiece processor (source.spm).
     */
    std::vector<std::string> tokenize(const std::string& text) const {
        std::vector<std::string> tokens;
        std::istringstream stream(text);
        std::string token;
        while (stream >> token) {
            tokens.push_back(token);
        }
        return tokens;
    }

    /**
     * Detokenización: une tokens con espacio y limpia artefactos.
     *
     * CTranslate2 puede producir tokens con el prefijo "▁" (SentencePiece)
     * que se eliminan para obtener texto legible.
     */
    std::string detokenize(const std::vector<std::string>& tokens) const {
        std::string result;
        for (size_t i = 0; i < tokens.size(); ++i) {
            std::string t = tokens[i];

            // Limpiar prefijo SentencePiece "▁" (U+2581) — común en OPUS-MT
            if (!t.empty() && static_cast<unsigned char>(t[0]) == 0xE2
                && t.size() >= 3 && static_cast<unsigned char>(t[1]) == 0x96
                && static_cast<unsigned char>(t[2]) == 0x81) {
                t = t.substr(3);
            }
            // También limpiar prefijo "▁" UTF-8 codificado como 3 bytes
            if (t.size() >= 3 && t[0] == '\xe2' && t[1] == '\x96' && t[2] == '\x81') {
                t = t.substr(3);
            }

            if (i > 0 && !t.empty() && t[0] != '\'' && t[0] != '.'
                && t[0] != ',' && t[0] != '?' && t[0] != '!'
                && t[0] != ';' && t[0] != ':' && t[0] != ')'
                && t[0] != ']' && t[0] != '}' && t[0] != '%') {
                result += ' ';
            }
            result += t;
        }
        return result;
    }
};

// ─── Command handler ───────────────────────────────────────

/**
 * Procesa un comando JSON y retorna la respuesta JSON.
 */
json handle_command(const json& request, Translator& translator) {
    std::string cmd;

    try {
        cmd = request.value("command", "");
    } catch (const std::exception& e) {
        return {{"status", "error"},
                {"message", std::string("Invalid request: ") + e.what()}};
    }

    if (cmd == "load_model") {
        try {
            std::string model_path = request.at("model_path");
            std::string src_lang = request.value("src_lang", "en");
            std::string tgt_lang = request.value("tgt_lang", "es");

            translator.load_model(model_path, src_lang, tgt_lang);

            return {
                {"status", "loaded"},
                {"model", model_path},
                {"src_lang", src_lang},
                {"tgt_lang", tgt_lang}
            };
        } catch (const std::exception& e) {
            return {{"status", "error"},
                    {"message", std::string("load_model failed: ") + e.what()}};
        }
    }
    else if (cmd == "translate") {
        try {
            std::string text = request.at("text");
            int id = request.value("id", 0);

            std::string translated = translator.translate(text);

            return {
                {"status", "ok"},
                {"result", translated},
                {"id", id}
            };
        } catch (const std::exception& e) {
            return {{"status", "error"},
                    {"message", std::string("translate failed: ") + e.what()}};
        }
    }
    else if (cmd == "ping") {
        return {{"status", "pong"}};
    }
    else if (cmd == "shutdown") {
        return {{"status", "shutting_down"}};
    }
    else {
        return {{"status", "error"},
                {"message", "Unknown command: " + cmd}};
    }
}

// ─── Main loop ─────────────────────────────────────────────

/**
 * Punto de entrada: lee líneas JSON de stdin, procesa comandos,
 * escribe respuestas JSON a stdout.
 *
 * El loop continúa hasta:
 *   - EOF en stdin (pipe cerrado)
 *   - Comando "shutdown"
 *   - SIGINT/SIGTERM
 */
int main() {
    // Signal handlers para cierre limpio
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    // Buffer de línea para correcto JSON IPC
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(nullptr);

    // Translator (carga diferida con load_model)
    Translator translator;

    std::string line;

    // Main read-eval-print loop
    while (g_running && std::getline(std::cin, line)) {
        if (line.empty()) {
            continue;
        }

        std::clog << "[ct2_server] <- " << line << std::endl;

        json response;
        try {
            json request = json::parse(line);
            response = handle_command(request, translator);
        } catch (const json::parse_error& e) {
            response = {
                {"status", "error"},
                {"message", std::string("JSON parse error: ") + e.what()}
            };
        } catch (const std::exception& e) {
            response = {
                {"status", "error"},
                {"message", std::string("Unexpected error: ") + e.what()}
            };
        }

        std::cout << response.dump() << std::endl;
        std::clog << "[ct2_server] -> " << response.dump() << std::endl;

        // Salir después de shutdown
        if (response.value("status", "") == "shutting_down") {
            break;
        }
    }

    std::clog << "[ct2_server] Exiting cleanly." << std::endl;
    return 0;
}
