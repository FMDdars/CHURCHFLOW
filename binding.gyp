{
  "variables": {
    "ndi_sdk_dir%": "<!@(node -p \"process.env.NDI_SDK_DIR || ''\")"
  },
  "targets": [
    {
      "target_name": "churchflow_ndi",
      "sources": [ "ndi_sender.cpp" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(ndi_sdk_dir)/Include"
      ],
      "dependencies": [ "<!(node -p \"require('node-addon-api').gyp\")" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "libraries": [ "<(ndi_sdk_dir)/Lib/x64/Processing.NDI.Lib.x64.lib" ],
      "conditions": [
        [ "OS=='win'", { "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1, "AdditionalOptions": [ "/std:c++17" ] } } } ],
        [ "OS!='win'", { "type": "none" } ]
      ]
    }
  ]
}
