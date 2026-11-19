package id.tefa.smartgreenhouse.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class TelemetrySummarySnapshot(
    val sensorsSummary: String,
    val weatherTemp: String,
    val weatherDesc: String,
    val waterTemp: String
)

object AiAssistantClient {

    data class ProviderSpec(
        val key: String,
        val label: String,
        val isGemini: Boolean,
        val chatUrl: String,
        val modelsUrl: String?,
        val models: List<String>
    )

    val providers: Map<String, ProviderSpec> = mapOf(
        "gemini" to ProviderSpec(
            key = "gemini",
            label = "Gemini",
            isGemini = true,
            chatUrl = "",
            modelsUrl = null,
            models = listOf("gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro")
        ),
        "groq" to ProviderSpec(
            key = "groq",
            label = "Groq",
            isGemini = false,
            chatUrl = "https://api.groq.com/openai/v1/chat/completions",
            modelsUrl = "https://api.groq.com/openai/v1/models",
            models = listOf(
                "llama-3.1-8b-instant",
                "meta-llama/llama-4-scout-17b-16e-instruct",
                "qwen/qwen3-32b",
                "qwen-qwq-32b",
                "gemma2-9b-it",
                "llama3-8b-8192",
                "llama-3.3-70b-versatile"
            )
        ),
        "qwen" to ProviderSpec(
            key = "qwen",
            label = "Qwen",
            isGemini = false,
            chatUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            modelsUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
            models = listOf("qwen-plus", "qwen-turbo", "qwen-max", "qwen2.5-72b-instruct")
        ),
        "openai" to ProviderSpec(
            key = "openai",
            label = "OpenAI",
            isGemini = false,
            chatUrl = "https://api.openai.com/v1/chat/completions",
            modelsUrl = "https://api.openai.com/v1/models",
            models = listOf("gpt-4o-mini", "gpt-4.1-mini", "gpt-3.5-turbo")
        ),
        "deepseek" to ProviderSpec(
            key = "deepseek",
            label = "DeepSeek",
            isGemini = false,
            chatUrl = "https://api.deepseek.com/chat/completions",
            modelsUrl = "https://api.deepseek.com/models",
            models = listOf("deepseek-chat", "deepseek-reasoner")
        ),
        "openrouter" to ProviderSpec(
            key = "openrouter",
            label = "OpenRouter",
            isGemini = false,
            chatUrl = "https://openrouter.ai/api/v1/chat/completions",
            modelsUrl = "https://openrouter.ai/api/v1/models",
            models = listOf(
                "openai/gpt-4o-mini",
                "google/gemini-2.0-flash-001",
                "meta-llama/llama-3.1-8b-instruct:free"
            )
        )
    )

    private val workingModelCache = mutableMapOf<String, String>()

    fun generateLocalFallbackReply(userText: String, t: TelemetrySummarySnapshot): String {
        val lower = userText.lowercase()
        if (lower.contains("ph") || lower.contains("nutrisi") ||
            lower.contains("ec") || lower.contains("cahaya") || lower.contains("lux")
        ) {
            return "Pembacaan sensor saat ini: ${t.sensorsSummary}. Suhu air tercatat ${t.waterTemp}."
        }
        if (lower.contains("suhu") || lower.contains("cuaca") || lower.contains("kelembaban") ||
            lower.contains("kelembapan") || lower.contains("aws")
        ) {
            return "Kondisi lingkungan greenhouse: suhu udara ${t.weatherTemp} dengan status ${t.weatherDesc}, dan suhu air ${t.waterTemp}."
        }
        if (lower.contains("status") || lower.contains("sensor") || lower.contains("cek") || lower.contains("diagnosa")) {
            return "Ringkasan telemetri: ${t.sensorsSummary}. Suhu air ${t.waterTemp}, suhu udara ${t.weatherTemp} (${t.weatherDesc}). Data otomatis diperbarui bila ESP32 tersambung."
        }
        if (lower.contains("hai") || lower.contains("halo") || lower.contains("selamat")) {
            return "Halo! Saya Asisten AI Greenhouse Anda. Silakan tanya lewat suara atau ketik mengenai pH, nutrisi, suhu air, dan cuaca."
        }
        return "Saya menerima pertanyaan Anda: \"$userText\". Data saat ini: ${t.sensorsSummary} dengan suhu air ${t.waterTemp}."
    }

    suspend fun askAi(
        rawProvider: String,
        rawApiKey: String,
        userText: String,
        telemetry: TelemetrySummarySnapshot
    ): Result<String> = withContext(Dispatchers.IO) {
        val cleanKey = rawApiKey.trim().trim('"', '\'')
        if (cleanKey.isEmpty()) {
            return@withContext Result.success(generateLocalFallbackReply(userText, telemetry))
        }

        var providerKey = if (providers.containsKey(rawProvider)) rawProvider else "gemini"
        var preferQwenOnGroq = false
        when {
            cleanKey.startsWith("AIza") -> providerKey = "gemini"
            cleanKey.startsWith("gsk_") -> {
                if (providerKey == "qwen") preferQwenOnGroq = true
                providerKey = "groq"
            }
            cleanKey.startsWith("sk-or-") -> providerKey = "openrouter"
        }

        val spec = providers[providerKey] ?: providers.getValue("gemini")
        val systemPrompt = "Kamu adalah Asisten AI Greenhouse Hidroponik TeFa. Jawab ringkas, akurat, dan ramah dalam Bahasa Indonesia (maksimal 3 kalimat agar nyaman dibacakan suara). " +
            "Data sensor saat ini: ${telemetry.sensorsSummary}. Suhu air: ${telemetry.waterTemp}. Suhu udara: ${telemetry.weatherTemp} (${telemetry.weatherDesc})."

        val cacheKey = "${spec.key}:${if (preferQwenOnGroq) "q:" else ""}${cleanKey.take(14)}"
        val queue = mutableListOf<String>()
        workingModelCache[cacheKey]?.let { queue.add(it) }
        val defaults = spec.models.toMutableList()
        if (preferQwenOnGroq) {
            defaults.sortBy { if (it.contains("qwen", ignoreCase = true)) 0 else 1 }
        }
        for (m in defaults) {
            if (!queue.contains(m)) queue.add(m)
        }

        val tried = mutableSetOf<String>()
        var discovered = false
        var lastError: Exception = Exception("Tidak ada model aktif yang tersedia")

        while (queue.isNotEmpty()) {
            val modelId = queue.removeAt(0)
            if (!tried.add(modelId)) continue

            try {
                val reply = callSingleModel(spec, cleanKey, modelId, systemPrompt, userText)
                workingModelCache[cacheKey] = modelId
                return@withContext Result.success(reply)
            } catch (ex: HttpApiException) {
                lastError = ex
                if (!isModelUnavailableError(ex.status, ex.message)) {
                    return@withContext Result.failure(ex)
                }
                if (!discovered) {
                    discovered = true
                    val liveModels = discoverModels(spec, cleanKey, preferQwenOnGroq)
                    for (lm in liveModels) {
                        if (!tried.contains(lm) && !queue.contains(lm)) {
                            queue.add(0, lm)
                        }
                    }
                }
            } catch (ex: Exception) {
                lastError = ex
                return@withContext Result.failure(ex)
            }
        }
        Result.failure(lastError)
    }

    private fun callSingleModel(
        spec: ProviderSpec,
        apiKey: String,
        modelId: String,
        systemPrompt: String,
        userText: String
    ): String {
        if (spec.isGemini) {
            val urlStr = "https://generativelanguage.googleapis.com/v1beta/models/" +
                URLEncoder.encode(modelId, "UTF-8") +
                ":generateContent?key=" +
                URLEncoder.encode(apiKey, "UTF-8")

            val bodyJson = JSONObject().apply {
                put("systemInstruction", JSONObject().apply {
                    put("parts", JSONArray().put(JSONObject().put("text", systemPrompt)))
                })
                put("contents", JSONArray().put(JSONObject().apply {
                    put("role", "user")
                    put("parts", JSONArray().put(JSONObject().put("text", userText)))
                }))
            }
            val (status, respStr) = postJson(urlStr, bodyJson.toString(), null)
            val data = runCatching { JSONObject(respStr) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                val errMsg = data.optJSONObject("error")?.optString("message", "HTTP $status") ?: "HTTP $status"
                throw HttpApiException(status, errMsg)
            }
            val rawReply = data.optJSONArray("candidates")
                ?.optJSONObject(0)
                ?.optJSONObject("content")
                ?.optJSONArray("parts")
                ?.optJSONObject(0)
                ?.optString("text", "")
            val cleaned = cleanAiReply(rawReply)
            if (cleaned.isEmpty()) throw Exception("Respon Gemini kosong")
            return cleaned
        } else {
            val bodyJson = JSONObject().apply {
                put("model", modelId)
                put("messages", JSONArray().apply {
                    put(JSONObject().put("role", "system").put("content", systemPrompt))
                    put(JSONObject().put("role", "user").put("content", userText))
                })
                put("temperature", 0.6)
                put("max_tokens", 650)
            }
            val (status, respStr) = postJson(spec.chatUrl, bodyJson.toString(), apiKey)
            val data = runCatching { JSONObject(respStr) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                val errMsg = data.optJSONObject("error")?.optString("message", "HTTP $status") ?: "HTTP $status"
                throw HttpApiException(status, errMsg)
            }
            val rawReply = data.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content", "")
            val cleaned = cleanAiReply(rawReply)
            if (cleaned.isEmpty()) throw Exception("Respon ${spec.label} kosong")
            return cleaned
        }
    }

    private fun discoverModels(spec: ProviderSpec, apiKey: String, preferQwen: Boolean): List<String> {
        return try {
            if (spec.isGemini) {
                val url = URL("https://generativelanguage.googleapis.com/v1beta/models?key=${URLEncoder.encode(apiKey, "UTF-8")}")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 8000
                    readTimeout = 8000
                }
                if (conn.responseCode !in 200..299) {
                    conn.disconnect()
                    return emptyList()
                }
                val text = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
                conn.disconnect()
                val arr = JSONObject(text).optJSONArray("models") ?: return emptyList()
                val found = mutableListOf<String>()
                for (i in 0 until arr.length()) {
                    val m = arr.optJSONObject(i) ?: continue
                    val methods = m.optJSONArray("supportedGenerationMethods") ?: continue
                    var supportsGen = false
                    for (j in 0 until methods.length()) {
                        if (methods.optString(j) == "generateContent") supportsGen = true
                    }
                    if (!supportsGen) continue
                    val id = m.optString("name", "").removePrefix("models/")
                    if (id.isBlank() || Regex("embedding|aqa|imagen|tts|robotics", RegexOption.IGNORE_CASE).containsMatchIn(id)) continue
                    found.add(id)
                }
                found.sortBy {
                    when {
                        it.contains("2.0-flash") || it.contains("2.5-flash") -> 0
                        it.contains("flash") -> 1
                        else -> 2
                    }
                }
                found
            } else {
                val modelsUrl = spec.modelsUrl ?: return emptyList()
                val conn = (URL(modelsUrl).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("Authorization", "Bearer $apiKey")
                }
                if (conn.responseCode !in 200..299) {
                    conn.disconnect()
                    return emptyList()
                }
                val text = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
                conn.disconnect()
                val arr = JSONObject(text).optJSONArray("data") ?: return emptyList()
                val found = mutableListOf<String>()
                for (i in 0 until arr.length()) {
                    val id = arr.optJSONObject(i)?.optString("id", "") ?: continue
                    if (id.isBlank() || Regex("whisper|tts|guard|embed|rerank|playai|orpheus|dall-e|sora|realtime|transcribe|audio|moderation|imagen|veo", RegexOption.IGNORE_CASE).containsMatchIn(id)) continue
                    found.add(id)
                }
                if (preferQwen) {
                    found.sortBy { if (it.contains("qwen", ignoreCase = true)) 0 else 1 }
                }
                found
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun postJson(urlStr: String, body: String, bearer: String?): Pair<Int, String> {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            if (!bearer.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $bearer")
            }
        }
        conn.outputStream.use { os ->
            os.write(body.toByteArray(Charsets.UTF_8))
            os.flush()
        }
        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
        val text = BufferedReader(InputStreamReader(stream)).use { it.readText() }
        conn.disconnect()
        return status to text
    }

    private fun cleanAiReply(raw: String?): String {
        var text = (raw ?: "").replace(Regex("<think>[\\s\\S]*?</think>", RegexOption.IGNORE_CASE), "").trim()
        if (text.startsWith("<think>", ignoreCase = true)) {
            val splitIdx = text.lastIndexOf("\n\n")
            text = if (splitIdx != -1) text.substring(splitIdx + 2).trim() else ""
        }
        return text
    }

    private fun isAuthOrQuotaError(status: Int, msg: String?): Boolean {
        if (status == 401 || status == 403 || status == 429) return true
        return Regex("invalid.*api.?key|incorrect.*api.?key|unauthorized|authentication|quota|billing|rate.?limit", RegexOption.IGNORE_CASE)
            .containsMatchIn(msg ?: "")
    }

    private fun isModelUnavailableError(status: Int, msg: String?): Boolean {
        if (isAuthOrQuotaError(status, msg)) return false
        return status == 404 || Regex(
            "does not exist|not have access|model_not_found|decommissioned|not found|invalid_model|not supported|deprecated",
            RegexOption.IGNORE_CASE
        ).containsMatchIn(msg ?: "")
    }

    private class HttpApiException(val status: Int, message: String) : Exception(message)
}
