#include <napi.h>
#include <Processing.NDI.Lib.h>
#include <windows.h>
#include <cstdint>
#include <string>
#include <vector>

namespace {
HMODULE ndiLibrary = nullptr;
const NDIlib_v6_3* ndiApi = nullptr;
NDIlib_send_instance_t sender = nullptr;
bool initialized = false;
int frameWidth = 0;
int frameHeight = 0;
std::vector<uint8_t> bgraFrame;

std::wstring EnvironmentValue(const wchar_t* name) {
  wchar_t value[32768]{};
  const DWORD length = GetEnvironmentVariableW(name, value, static_cast<DWORD>(std::size(value)));
  return length > 0 && length < std::size(value) ? std::wstring(value, length) : std::wstring();
}

bool LoadNdiApi() {
  if (ndiApi) return true;

  const std::wstring programFiles = EnvironmentValue(L"ProgramW6432").empty()
      ? L"C:\\Program Files" : EnvironmentValue(L"ProgramW6432");
  const std::wstring sdkDirectory = EnvironmentValue(L"NDI_SDK_DIR");
  const std::wstring runtimeDirectory = EnvironmentValue(L"NDI_RUNTIME_DIR_V6");
  const std::wstring dllName = L"Processing.NDI.Lib.x64.dll";

  std::vector<std::wstring> candidates;
  if (!runtimeDirectory.empty()) candidates.push_back(runtimeDirectory + L"\\" + dllName);
  candidates.push_back(programFiles + L"\\NDI\\NDI 6 Runtime\\" + dllName);
  if (!sdkDirectory.empty()) {
    candidates.push_back(sdkDirectory + L"\\Bin\\x64\\" + dllName);
    candidates.push_back(sdkDirectory + L"\\Bin\\" + dllName);
  }

  for (const auto& candidate : candidates) {
    ndiLibrary = LoadLibraryW(candidate.c_str());
    if (ndiLibrary) break;
  }
  // Permit a standard NDI Runtime installation already registered on PATH.
  if (!ndiLibrary) ndiLibrary = LoadLibraryW(dllName.c_str());
  if (!ndiLibrary) return false;

  using LoadApiFunction = const NDIlib_v6_3* (__cdecl*)();
  auto loadApi = reinterpret_cast<LoadApiFunction>(
      GetProcAddress(ndiLibrary, "NDIlib_v6_3_load"));
  if (!loadApi) {
    FreeLibrary(ndiLibrary);
    ndiLibrary = nullptr;
    return false;
  }

  ndiApi = loadApi();
  if (!ndiApi || !ndiApi->initialize || !ndiApi->destroy ||
      !ndiApi->send_create || !ndiApi->send_destroy ||
      !ndiApi->send_send_video_v2) {
    ndiApi = nullptr;
    FreeLibrary(ndiLibrary);
    ndiLibrary = nullptr;
    return false;
  }
  return true;
}

void UnloadNdiApi() {
  ndiApi = nullptr;
  if (ndiLibrary) {
    FreeLibrary(ndiLibrary);
    ndiLibrary = nullptr;
  }
}

Napi::Value Initialize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "A source name is required.").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (!LoadNdiApi()) return Napi::Boolean::New(env, false);
  if (sender) { ndiApi->send_destroy(sender); sender = nullptr; }
  if (!initialized) {
    initialized = ndiApi->initialize();
    if (!initialized) return Napi::Boolean::New(env, false);
  }

  const std::string sourceName = info[0].As<Napi::String>().Utf8Value();
  NDIlib_send_create_t description{};
  description.p_ndi_name = sourceName.c_str();
  description.p_groups = nullptr;
  description.clock_video = true;
  description.clock_audio = false;
  sender = ndiApi->send_create(&description);
  bgraFrame.clear();
  frameWidth = 0;
  frameHeight = 0;
  return Napi::Boolean::New(env, sender != nullptr);
}

Napi::Value SetFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!sender) {
    Napi::Error::New(env, "NDI sender has not been initialized.").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 3 || !info[0].IsBuffer() || !info[1].IsNumber() || !info[2].IsNumber()) {
    Napi::TypeError::New(env, "setFrame expects (Buffer, width, height).").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  Napi::Buffer<uint8_t> rgba = info[0].As<Napi::Buffer<uint8_t>>();
  const int width = info[1].As<Napi::Number>().Int32Value();
  const int height = info[2].As<Napi::Number>().Int32Value();
  if (width < 1 || height < 1 || width > 3840 || height > 2160) {
    Napi::RangeError::New(env, "Unsupported NDI frame dimensions.").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const size_t expected = static_cast<size_t>(width) * static_cast<size_t>(height) * 4;
  if (rgba.Length() != expected) {
    Napi::RangeError::New(env, "The RGBA buffer size does not match the frame dimensions.").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::vector<uint8_t> nextFrame(expected);
  for (size_t i = 0; i < expected; i += 4) {
    nextFrame[i] = rgba[i + 2];
    nextFrame[i + 1] = rgba[i + 1];
    nextFrame[i + 2] = rgba[i];
    nextFrame[i + 3] = rgba[i + 3];
  }
  bgraFrame.swap(nextFrame);
  frameWidth = width;
  frameHeight = height;
  return Napi::Boolean::New(env, true);
}

Napi::Value SendFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!sender || !ndiApi || bgraFrame.empty() || frameWidth < 1 || frameHeight < 1) {
    return Napi::Boolean::New(env, false);
  }
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "sendFrame expects fps.").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const int fps = info[0].As<Napi::Number>().Int32Value();
  if (fps != 30 && fps != 60) {
    Napi::RangeError::New(env, "Supported frame rates are 30 and 60 fps.").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  NDIlib_video_frame_v2_t frame{};
  frame.xres = frameWidth;
  frame.yres = frameHeight;
  frame.FourCC = NDIlib_FourCC_type_BGRA;
  frame.frame_rate_N = fps;
  frame.frame_rate_D = 1;
  frame.picture_aspect_ratio = static_cast<float>(frameWidth) / static_cast<float>(frameHeight);
  frame.frame_format_type = NDIlib_frame_format_type_progressive;
  frame.timecode = NDIlib_send_timecode_synthesize;
  frame.p_data = bgraFrame.data();
  frame.line_stride_in_bytes = frameWidth * 4;
  frame.p_metadata = nullptr;
  frame.timestamp = 0;
  ndiApi->send_send_video_v2(sender, &frame);
  return Napi::Boolean::New(env, true);
}

Napi::Value Close(const Napi::CallbackInfo& info) {
  if (sender && ndiApi) { ndiApi->send_destroy(sender); sender = nullptr; }
  bgraFrame.clear();
  frameWidth = 0;
  frameHeight = 0;
  if (initialized && ndiApi) ndiApi->destroy();
  initialized = false;
  UnloadNdiApi();
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("initialize", Napi::Function::New(env, Initialize));
  exports.Set("setFrame", Napi::Function::New(env, SetFrame));
  exports.Set("sendFrame", Napi::Function::New(env, SendFrame));
  exports.Set("close", Napi::Function::New(env, Close));
  return exports;
}
}  // namespace

NODE_API_MODULE(churchflow_ndi, Init)
