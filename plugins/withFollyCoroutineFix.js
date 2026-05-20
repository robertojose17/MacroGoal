const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fixes iOS build errors with Xcode 26 / iPhoneOS26.0.sdk:
 * 1. `folly/coro/Coroutine.h file not found` — prepends FOLLY_CFG_NO_COROUTINES=1 define
 * 2. `#include <ranges>` broken — replaces ShadowTreeCloner.cpp with C++17-compatible version
 * 3. C++ override mismatch — ReanimatedMountHook::shadowTreeDidMount uses `double mountTime`
 *    but UIManagerMountHook base class changed to `HighResTimeStamp mountTime` in RN 0.81.x
 * 4. Duplicate symbols libRNWorklets.a / libRNReanimated.a — neutralize RNWorklets pod
 *    (react-native-reanimated 3.17.x bundles worklets internally)
 *
 * Uses withDangerousMod so it runs DURING expo prebuild, after node_modules exist.
 * Also injects FOLLY_CFG_NO_COROUTINES=1 into Podfile post_install as belt-and-suspenders.
 */

const FOLLY_MARKER = 'patch-folly: disable Folly coroutines for Xcode 26';
const FOLLY_BLOCK =
  '// ' + FOLLY_MARKER + '\n' +
  '#ifndef FOLLY_CFG_NO_COROUTINES\n' +
  '#define FOLLY_CFG_NO_COROUTINES 1\n' +
  '#endif\n\n';

const RANGES_MARKER = 'ranges-patch: removed <ranges> for iPhoneOS26.0.sdk';

// Marker for the HighResTimeStamp signature fix
const MOUNT_HOOK_MARKER = 'mount-hook-patch: HighResTimeStamp signature for RN 0.81.x';

const FIXED_SHADOW_TREE_CLONER = `// ${RANGES_MARKER}
#include <reanimated/Fabric/ShadowTreeCloner.h>
#include <reanimated/Tools/ReanimatedSystraceSection.h>

#include <utility>

namespace reanimated {

Props::Shared mergeProps(
    const ShadowNode &shadowNode,
    const PropsMap &propsMap,
    const ShadowNodeFamily &family) {
  ReanimatedSystraceSection s("ShadowTreeCloner::mergeProps");

  const auto it = propsMap.find(&family);

  if (it == propsMap.end()) {
    return ShadowNodeFragment::propsPlaceholder();
  }

  PropsParserContext propsParserContext{
      shadowNode.getSurfaceId(), *shadowNode.getContextContainer()};
  const auto &propsVector = it->second;
  auto newProps = shadowNode.getProps();

#ifdef ANDROID
  if (propsVector.size() > 1) {
    folly::dynamic newPropsDynamic = folly::dynamic::object;
    for (const auto &props : propsVector) {
      newPropsDynamic = folly::dynamic::merge(
          props.operator folly::dynamic(), newPropsDynamic);
    }
    return shadowNode.getComponentDescriptor().cloneProps(
        propsParserContext, newProps, RawProps(newPropsDynamic));
  }
#endif

  for (const auto &props : propsVector) {
    newProps = shadowNode.getComponentDescriptor().cloneProps(
        propsParserContext, newProps, RawProps(props));
  }

  return newProps;
}

std::shared_ptr<ShadowNode> cloneShadowTreeWithNewPropsRecursive(
    const ShadowNode &shadowNode,
    const ChildrenMap &childrenMap,
    const PropsMap &propsMap) {
  const auto family = &shadowNode.getFamily();
  const auto affectedChildrenIt = childrenMap.find(family);
  auto children = shadowNode.getChildren();

  if (affectedChildrenIt != childrenMap.end()) {
    for (const auto index : affectedChildrenIt->second) {
      children[index] = cloneShadowTreeWithNewPropsRecursive(
          *children[index], childrenMap, propsMap);
    }
  }

  return shadowNode.clone(
      {mergeProps(shadowNode, propsMap, *family),
       std::make_shared<std::vector<std::shared_ptr<const ShadowNode>>>(
           children),
       shadowNode.getState(),
       false});
}

RootShadowNode::Unshared cloneShadowTreeWithNewProps(
    const RootShadowNode &oldRootNode,
    const PropsMap &propsMap) {
  ReanimatedSystraceSection s("ShadowTreeCloner::cloneShadowTreeWithNewProps");

  ChildrenMap childrenMap;

  {
    ReanimatedSystraceSection s("ShadowTreeCloner::prepareChildrenMap");

    for (auto &[family, _] : propsMap) {
      const auto ancestors = family->getAncestors(oldRootNode);

      for (auto rit = ancestors.rbegin(); rit != ancestors.rend(); ++rit) {
        const auto parentFamily = &rit->first.get().getFamily();
        auto &affectedChildren = childrenMap[parentFamily];

        if (affectedChildren.contains(rit->second)) {
          continue;
        }

        affectedChildren.insert(rit->second);
      }
    }
  }

  return std::static_pointer_cast<RootShadowNode>(
      cloneShadowTreeWithNewPropsRecursive(oldRootNode, childrenMap, propsMap));
}

} // namespace reanimated
`;

function applySourcePatches(projectRoot) {
  const fabricDir = path.join(
    projectRoot,
    'node_modules/react-native-reanimated/Common/cpp/reanimated/Fabric'
  );

  if (!fs.existsSync(fabricDir)) {
    console.warn('[withFollyCoroutineFix] Fabric dir not found — skipping source patches:', fabricDir);
    return;
  }

  // Fix 1: Prepend FOLLY_CFG_NO_COROUTINES to ReanimatedMountHook.cpp and ReanimatedCommitHook.cpp
  const follyTargets = [
    path.join(fabricDir, 'ReanimatedMountHook.cpp'),
    path.join(fabricDir, 'ReanimatedCommitHook.cpp'),
  ];

  for (const filePath of follyTargets) {
    if (!fs.existsSync(filePath)) {
      console.log('[withFollyCoroutineFix] Not found (ok):', filePath);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(FOLLY_MARKER)) {
      console.log('[withFollyCoroutineFix] Already patched (folly):', path.basename(filePath));
      continue;
    }
    fs.writeFileSync(filePath, FOLLY_BLOCK + content, 'utf8');
    console.log('[withFollyCoroutineFix] Patched (folly):', path.basename(filePath));
  }

  // Fix 2: Replace ShadowTreeCloner.cpp entirely with C++17-compatible version
  const shadowTreeClonerPath = path.join(fabricDir, 'ShadowTreeCloner.cpp');
  if (!fs.existsSync(shadowTreeClonerPath)) {
    console.log('[withFollyCoroutineFix] ShadowTreeCloner.cpp not found (ok)');
  } else {
    const content = fs.readFileSync(shadowTreeClonerPath, 'utf8');
    if (content.includes(RANGES_MARKER)) {
      console.log('[withFollyCoroutineFix] ShadowTreeCloner.cpp already patched (<ranges>)');
    } else {
      fs.writeFileSync(shadowTreeClonerPath, FIXED_SHADOW_TREE_CLONER, 'utf8');
      console.log('[withFollyCoroutineFix] Patched ShadowTreeCloner.cpp (<ranges> removed)');
    }
  }

  // Fix 3: DISABLED for reanimated 4.x — ReanimatedMountHook.h already handles
  // HighResTimeStamp via #if REACT_NATIVE_MINOR_VERSION >= 81 in reanimated 4.1.7+
  console.log('[withFollyCoroutineFix] Fix 3: skipped (reanimated 4.x already correct)');

  // Fix 5: ReanimatedModuleProxy.cpp — add shadowNodeFromValue compat shim for RN 0.81.x
  const reanimatedProxyPath = path.join(
    projectRoot,
    'node_modules/react-native-reanimated/Common/cpp/reanimated/NativeModules/ReanimatedModuleProxy.cpp'
  );
  const PROXY_SHIM_MARKER = 'compat-shim-v7: shadowNodeFromValue removed in RN 0.81.x';
  // Shim goes AFTER the primitives.h include, still inside #ifdef RCT_NEW_ARCH_ENABLED,
  // so shadowNodeListFromValue is in scope. shadowNodeListFromValue returns
  // std::shared_ptr<std::vector<ShadowNode::Shared>>, so ->at(0) is correct.
  const PROXY_SHIM = `\n// ${PROXY_SHIM_MARKER}\nnamespace {\ninline facebook::react::ShadowNode::Shared shadowNodeFromValue(\n    facebook::jsi::Runtime &rt,\n    const facebook::jsi::Value &value) {\n  auto list = shadowNodeListFromValue(rt, value);\n  return list->at(0);\n}\n} // namespace\n`;
  const PRIMITIVES_INCLUDE = '#include <react/renderer/uimanager/primitives.h>';

  if (!fs.existsSync(reanimatedProxyPath)) {
    console.log('[withFollyCoroutineFix] ReanimatedModuleProxy.cpp not found (ok)');
  } else {
    let proxyContent = fs.readFileSync(reanimatedProxyPath, 'utf8');
    if (proxyContent.includes(PROXY_SHIM_MARKER)) {
      console.log('[withFollyCoroutineFix] ReanimatedModuleProxy.cpp already has v7 compat shim');
    } else {
      // Remove any old shim versions
      const oldMarkers = [
        'compat-shim: shadowNodeFromValue removed in RN 0.81.x',
        'compat-shim-v5: shadowNodeFromValue removed in RN 0.81.x',
        'compat-shim-v6: shadowNodeFromValue removed in RN 0.81.x',
      ];
      for (const oldMarker of oldMarkers) {
        if (proxyContent.includes(oldMarker)) {
          const shimStart = proxyContent.indexOf('// ' + oldMarker);
          const shimEnd = proxyContent.indexOf('} // namespace\n', shimStart) + '} // namespace\n'.length;
          proxyContent = proxyContent.slice(0, shimStart) + proxyContent.slice(shimEnd);
          console.log('[withFollyCoroutineFix] Removed old shim version');
        }
      }
      // Also remove any call-site replacements from even older attempts
      proxyContent = proxyContent
        .replaceAll('shadowNodeListFromValue(rnRuntime, shadowNodeWrapper).front()', 'shadowNodeFromValue(rnRuntime, shadowNodeWrapper)')
        .replaceAll('shadowNodeListFromValue(rt, shadowNodeWrapper).front()', 'shadowNodeFromValue(rt, shadowNodeWrapper)')
        .replaceAll('shadowNodeListFromValue(rt, shadowNodeValue).front()', 'shadowNodeFromValue(rt, shadowNodeValue)')
        .replaceAll('shadowNodeListFromValue(rnRuntime, shadowNodeWrapper)->front()', 'shadowNodeFromValue(rnRuntime, shadowNodeWrapper)')
        .replaceAll('shadowNodeListFromValue(rt, shadowNodeWrapper)->front()', 'shadowNodeFromValue(rt, shadowNodeWrapper)')
        .replaceAll('shadowNodeListFromValue(rt, shadowNodeValue)->front()', 'shadowNodeFromValue(rt, shadowNodeValue)');
      if (!proxyContent.includes(PRIMITIVES_INCLUDE)) {
        console.log('[withFollyCoroutineFix] ReanimatedModuleProxy.cpp: primitives.h include not found, skipping shim');
      } else {
        proxyContent = proxyContent.replace(PRIMITIVES_INCLUDE, PRIMITIVES_INCLUDE + PROXY_SHIM);
        fs.writeFileSync(reanimatedProxyPath, proxyContent, 'utf8');
        console.log('[withFollyCoroutineFix] Patched ReanimatedModuleProxy.cpp: injected v6 compat shim');
      }
    }
  }

  // Fix 7: ReanimatedModule.mm — EventListener is now a std::function alias in RN 0.81
  // std::make_shared<EventListener>(lambda) fails; must construct via std::function then wrap.
  const REA_MODULE_MARKER = 'rea-event-listener-patch-v1';
  const reaModulePath = path.join(
    projectRoot,
    'node_modules/react-native-reanimated/apple/reanimated/apple/ReanimatedModule.mm'
  );
  if (!fs.existsSync(reaModulePath)) {
    console.log('[withFollyCoroutineFix] Fix 7: ReanimatedModule.mm not found (ok)');
  } else {
    let reaContent = fs.readFileSync(reaModulePath, 'utf8');
    if (reaContent.includes(REA_MODULE_MARKER)) {
      console.log('[withFollyCoroutineFix] Fix 7: ReanimatedModule.mm already patched');
    } else {
      reaContent = reaContent.replace(
        /auto eventListener =\s*\n\s*std::make_shared<facebook::react::EventListener>\(\[reanimatedModuleProxyWeak\]\(const RawEvent &rawEvent\)/,
        'auto eventListenerFn = facebook::react::EventListener([reanimatedModuleProxyWeak](const RawEvent &rawEvent)'
      );
      reaContent = reaContent.replace(
        /\[scheduler addEventListener:eventListener\];/,
        'auto eventListener = std::make_shared<const facebook::react::EventListener>(std::move(eventListenerFn));\n    [scheduler addEventListener:eventListener];'
      );
      reaContent = '// ' + REA_MODULE_MARKER + '\n' + reaContent;
      fs.writeFileSync(reaModulePath, reaContent, 'utf8');
      console.log('[withFollyCoroutineFix] Fix 7: Patched ReanimatedModule.mm (EventListener std::function fix)');
    }
  }

  // Fix 6: Replace RNWorklets.podspec with a no-op stub (RNReanimated 3.17.x bundles worklets internally)
  // Overwrite entirely instead of patching to avoid Ruby syntax corruption.
  const WORKLETS_PATCH_MARKER = 'patch-folly-fix6: emptied for RNReanimated 3.17.x';
  const STUB_PODSPEC = `# ${WORKLETS_PATCH_MARKER}
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
`;
  const workletsPodspecCandidates = [
    path.join(projectRoot, 'node_modules/react-native-worklets-core/RNWorklets.podspec'),
    path.join(projectRoot, 'node_modules/react-native-worklets/RNWorklets.podspec'),
  ];
  for (const workletsPodspecPath of workletsPodspecCandidates) {
    if (!fs.existsSync(workletsPodspecPath)) {
      console.log('[withFollyCoroutineFix] Fix 6: podspec not found (ok):', workletsPodspecPath);
      continue;
    }
    const existing = fs.readFileSync(workletsPodspecPath, 'utf8');
    if (existing.includes(WORKLETS_PATCH_MARKER)) {
      console.log('[withFollyCoroutineFix] Fix 6: already patched:', workletsPodspecPath);
      continue;
    }
    fs.writeFileSync(workletsPodspecPath, STUB_PODSPEC, 'utf8');
    console.log('[withFollyCoroutineFix] Fix 6: Replaced podspec with no-op stub:', workletsPodspecPath);
  }

  // Fix 6b: Remove codegenConfig from worklets package.json (both package name variants)
  const WORKLETS_CODEGEN_MARKER = 'patch-folly-fix6: codegenConfig removed';
  const workletsPackageJsonCandidates = [
    path.join(projectRoot, 'node_modules/react-native-worklets-core/package.json'),
    path.join(projectRoot, 'node_modules/react-native-worklets/package.json'),
  ];
  for (const workletsPackageJsonPath of workletsPackageJsonCandidates) {
    if (!fs.existsSync(workletsPackageJsonPath)) {
      console.log('[withFollyCoroutineFix] Fix 6b: package.json not found (ok):', workletsPackageJsonPath);
      continue;
    }
    let workletsJson;
    try {
      workletsJson = JSON.parse(fs.readFileSync(workletsPackageJsonPath, 'utf8'));
    } catch (e) {
      console.warn('[withFollyCoroutineFix] Fix 6b: Failed to parse:', workletsPackageJsonPath, e.message);
      continue;
    }
    if (workletsJson._patchFollyFix6 === WORKLETS_CODEGEN_MARKER || !workletsJson.codegenConfig) {
      console.log('[withFollyCoroutineFix] Fix 6b: already patched or no codegenConfig:', workletsPackageJsonPath);
      continue;
    }
    delete workletsJson.codegenConfig;
    delete workletsJson.reactNativeConfig;
    workletsJson._patchFollyFix6 = WORKLETS_CODEGEN_MARKER;
    fs.writeFileSync(workletsPackageJsonPath, JSON.stringify(workletsJson, null, 2) + '\n', 'utf8');
    console.log('[withFollyCoroutineFix] Fix 6b: Removed codegenConfig from:', workletsPackageJsonPath);
  }

  // Fix 4: DISABLED for reanimated 4.x — ReanimatedMountHook.cpp already handles
  // HighResTimeStamp via #if REACT_NATIVE_MINOR_VERSION >= 81 in reanimated 4.1.7+
  console.log('[withFollyCoroutineFix] Fix 4: skipped (reanimated 4.x already correct)');
}

function applyPodfilePatch(podfilePath) {
  if (!fs.existsSync(podfilePath)) {
    console.log('[withFollyCoroutineFix] Podfile not found, skipping.');
    return;
  }

  let content = fs.readFileSync(podfilePath, 'utf8');

  if (content.includes('withFollyCoroutineFix-v15')) {
    console.log('[withFollyCoroutineFix] Podfile already patched.');
    return;
  }

  // --- RNWorklets pod override injection (REMOVED) ---
  // Fix 6 now overwrites the node_modules podspec with a no-op stub directly,
  // so injecting a second pod source causes a CocoaPods conflict. Remove any
  // previously injected overrides (v1 and v2) if present.
  content = content.replace(/\n {2}# withFollyCoroutineFix-worklets-override-v1\n {2}# Override RNWorklets[^\n]*\n {2}# Having both[^\n]*\n {2}pod 'RNWorklets'[^\n]*\n/g, '');
  content = content.replace(/\n {2}# withFollyCoroutineFix-worklets-override-v2\n {2}# Override RNWorklets[^\n]*\n {2}# Having both[^\n]*\n {2}pod 'RNWorklets'[^\n]*\n/g, '');

  // --- pre_install injection ---
  const PRE_INSTALL_BLOCK = `
pre_install do |installer|
  # withFollyCoroutineFix-pre-v3: Neutralize RNWorklets since RNReanimated 3.17.x bundles it internally
  begin
    next if installer.nil?
    pod_targets = installer.respond_to?(:pod_targets) ? installer.pod_targets : nil
    next if pod_targets.nil?
    pod_targets.compact.each do |target|
      next if target.nil?
      next unless target.name.to_s == 'RNWorklets' || target.name.to_s.start_with?('RNWorklets')
      target.build_configurations.each do |config|
        next if config.nil?
        config.build_settings['EXCLUDED_ARCHS[sdk=iphoneos*]'] = 'arm64 x86_64 arm64e'
        config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64 x86_64 arm64e'
        config.build_settings['EXCLUDED_ARCHS'] = 'arm64 x86_64 arm64e'
      end rescue nil
    end
  rescue => e
    puts "[withFollyCoroutineFix] pre_install error: #{e.message}"
  end
end
`;

  const preInstallMarker = 'withFollyCoroutineFix-pre-v3';
  if (!content.includes(preInstallMarker)) {
    // Remove old pre_install blocks (v1 and v2)
    content = content.replace(/\npre_install do \|installer\|\n {2}# withFollyCoroutineFix-pre-v[12][^\n]*\n[\s\S]*?\nend\n/g, '');
    // Inject before the first post_install block, or before end-of-file
    const preInstallInsertRegex = /^([ \t]*post_install do \|installer\|)/m;
    if (preInstallInsertRegex.test(content)) {
      content = content.replace(preInstallInsertRegex, PRE_INSTALL_BLOCK + '\n$1');
    } else {
      content = content + PRE_INSTALL_BLOCK;
    }
    console.log('[withFollyCoroutineFix] Podfile: injected pre_install RNWorklets neutralization.');
  }

  // --- post_install injection ---
  const postInstallRegex = /^([ \t]*post_install do \|installer\|[ \t]*)$/m;
  const injection = `  # withFollyCoroutineFix-v14 — disable Folly coroutines for Xcode 26 / iPhoneOS26.0.sdk
  begin
    next if installer.nil?
    pods_project = installer.pods_project rescue nil
    next if pods_project.nil?

    # Inject FOLLY_CFG_NO_COROUTINES=1 into all targets.
    # GCC_PREPROCESSOR_DEFINITIONS can be a String or an Array in Xcodeproj — handle both.
    pods_project.targets.each do |target|
      next if target.nil?
      target.build_configurations.each do |config|
        next if config.nil?
        existing = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS']
        if existing.nil?
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = '$(inherited) FOLLY_CFG_NO_COROUTINES=1'
        elsif existing.is_a?(Array)
          unless existing.any? { |v| v.to_s.include?('FOLLY_CFG_NO_COROUTINES') }
            existing << 'FOLLY_CFG_NO_COROUTINES=1'
          end
        elsif existing.is_a?(String)
          unless existing.include?('FOLLY_CFG_NO_COROUTINES')
            config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = existing + ' FOLLY_CFG_NO_COROUTINES=1'
          end
        end
      end rescue nil
    end

    # Neutralize RNWorklets: RNReanimated 3.17.x bundles it — exclude all archs so it links nothing
    pods_project.targets.each do |target|
      next if target.nil?
      next unless target.name.to_s == 'RNWorklets' || target.name.to_s.start_with?('RNWorklets')
      target.build_configurations.each do |config|
        next if config.nil?
        config.build_settings['EXCLUDED_ARCHS[sdk=iphoneos*]'] = 'arm64 x86_64 arm64e'
        config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64 x86_64 arm64e'
        config.build_settings['EXCLUDED_ARCHS'] = 'arm64 x86_64 arm64e'
        config.build_settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = 'DEBUG'
      end rescue nil
    end

    # Remove RNWorklets from all framework link phases
    pods_project.targets.each do |target|
      next if target.nil?
      (target.build_phases rescue []).each do |phase|
        next if phase.nil?
        next unless phase.is_a?(Xcodeproj::Project::Object::PBXFrameworksBuildPhase)
        (phase.files.to_a rescue []).each do |file|
          next if file.nil?
          next unless file.display_name.to_s.include?('RNWorklets')
          phase.remove_file_reference(file.file_ref) rescue nil
        end
      end
    end

    # Remove RNWorklets from ReactCodegen to fix duplicate codegen symbols
    pods_project.targets.each do |target|
      next if target.nil?
      next unless target.name == 'ReactCodegen' || target.name == 'React-Codegen'
      (target.source_build_phase.files.to_a rescue []).each do |file|
        next if file.nil?
        next unless file.display_name.to_s.include?('rnworklets')
        target.source_build_phase.remove_file_reference(file.file_ref) rescue nil
      end
    end

    # Fix shadowNodeFromValue removed in RN 0.81.x
    sandbox_root = (installer.sandbox.root rescue nil)
    unless sandbox_root.nil?
      proxy_cpp_candidates = Dir.glob(File.join(sandbox_root, '**', 'ReanimatedModuleProxy.cpp'))
      proxy_cpp_candidates.each do |proxy_cpp_path|
        next unless File.exist?(proxy_cpp_path)
        content = File.read(proxy_cpp_path) rescue next
        shim_marker = 'compat-shim-v7: shadowNodeFromValue removed in RN 0.81.x'
        primitives_include = '#include <react/renderer/uimanager/primitives.h>'
        next if content.include?(shim_marker)
        next unless content.include?(primitives_include)
        shim = <<~SHIM

// compat-shim-v7: shadowNodeFromValue removed in RN 0.81.x
// shadowNodeListFromValue returns std::shared_ptr<std::vector<ShadowNode::Shared>>
namespace {
inline facebook::react::ShadowNode::Shared shadowNodeFromValue(
    facebook::jsi::Runtime &rt,
    const facebook::jsi::Value &value) {
  auto list = shadowNodeListFromValue(rt, value);
  return list->at(0);
}
} // namespace
SHIM
        patched_content = content.sub(primitives_include, primitives_include + shim)
        File.write(proxy_cpp_path, patched_content) rescue nil
        puts "[withFollyCoroutineFix] Patched ReanimatedModuleProxy.cpp: injected v6 compat shim"
      end
    end
  rescue => e
    puts "[withFollyCoroutineFix] post_install error: #{e.message}"
    puts e.backtrace.first(5).join("\\n") rescue nil
  end`;

  if (postInstallRegex.test(content)) {
    content = content.replace(postInstallRegex, `$1\n${injection}`);
    fs.writeFileSync(podfilePath, content, 'utf8');
    console.log('[withFollyCoroutineFix] Podfile patched (injected inside existing post_install).');
    return;
  }

  // No post_install block found — append one at the end of the file
  console.warn('[withFollyCoroutineFix] No post_install block found — appending one to Podfile.');
  const appendedBlock = `
post_install do |installer|
${injection}
end
`;
  fs.writeFileSync(podfilePath, content + appendedBlock, 'utf8');
  console.log('[withFollyCoroutineFix] Podfile patched (appended new post_install block).');
}

function withFollyCoroutineFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      // cfg._internal.projectRoot is the repo root; modRequest.projectRoot is also available
      const projectRoot =
        (cfg._internal && cfg._internal.projectRoot) ||
        cfg.modRequest.projectRoot ||
        process.cwd();

      console.log('[withFollyCoroutineFix] projectRoot:', projectRoot);
      console.log('[withFollyCoroutineFix] Applying source patches...');
      applySourcePatches(projectRoot);

      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      console.log('[withFollyCoroutineFix] Podfile path:', podfilePath);
      applyPodfilePatch(podfilePath);

      return cfg;
    },
  ]);
}

module.exports = withFollyCoroutineFix;
