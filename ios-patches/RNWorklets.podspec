Pod::Spec.new do |s|
  s.name         = "RNWorklets"
  s.version      = "0.5.1"
  s.summary      = "No-op stub — worklets are bundled inside react-native-reanimated 3.17.x"
  s.description  = "This is a no-op stub podspec. react-native-reanimated 3.17.x bundles worklets internally. This stub exists to satisfy CocoaPods dependency resolution without producing duplicate symbols."
  s.homepage     = "https://github.com/software-mansion/react-native-reanimated"
  s.license      = { :type => "MIT" }
  s.author       = { "Software Mansion" => "contact@swmansion.com" }
  s.platform     = :ios, "13.4"
  s.source       = { :git => "https://github.com/software-mansion/react-native-reanimated.git", :tag => "3.17.0" }
  s.preserve_paths = "README.md"
end
