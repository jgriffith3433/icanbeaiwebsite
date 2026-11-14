/* ==========================================================================
   Babylon.js 9 from npm (bundled by Vite), as the global BABYLON the classic
   scripts (world.js) read. Imported first by js/app.js, so it runs before them.

   Named imports only (no `import * as`): Rollup keeps the classes listed here
   and what they pull in, not all of Babylon core, so the first download is
   smaller. A module that needs another Babylon class adds it to this list
   (npm test's scripts/check-babylon-names.mjs fails on a name missing here).
   ========================================================================== */
import {
  ArcRotateCamera, Axis, BoundingInfo, CascadedShadowGenerator, CharacterSupportedState, Color3, Color4,
  DefaultRenderingPipeline, DirectionalLight, DynamicTexture, Engine, EngineInstrumentation, EngineStore, Frustum,
  GPUParticleSystem, HavokPlugin, HemisphericLight, ImageProcessingConfiguration, Light, LoadAssetContainerAsync,
  Material, MaterialPluginBase, Matrix, Mesh, MeshBuilder, PBRMaterial, ParticleSystem, PhysicsAggregate, PhysicsBody,
  PhysicsCharacterController, PhysicsMotionType, PhysicsRaycastResult, PhysicsShapeBox, PhysicsShapeContainer,
  PhysicsShapeType, PointLight, Quaternion, RawTexture, RawTexture3D, Ray, ReflectionProbe, RenderTargetTexture,
  SSAO2RenderingPipeline, SSRRenderingPipeline, Scene, SceneInstrumentation, SceneLoader, ShaderLanguage,
  ShaderMaterial, ShadowGenerator, SpotLight, StandardMaterial, Texture, TransformNode, Vector2, Vector3, Vector4,
  VertexBuffer, VertexData, VolumetricLightScatteringPostProcess,
} from "@babylonjs/core";

const BABYLON = {
  ArcRotateCamera, Axis, BoundingInfo, CascadedShadowGenerator, CharacterSupportedState, Color3, Color4,
  DefaultRenderingPipeline, DirectionalLight, DynamicTexture, Engine, EngineInstrumentation, EngineStore, Frustum,
  GPUParticleSystem, HavokPlugin, HemisphericLight, ImageProcessingConfiguration, Light, LoadAssetContainerAsync,
  Material, MaterialPluginBase, Matrix, Mesh, MeshBuilder, PBRMaterial, ParticleSystem, PhysicsAggregate, PhysicsBody,
  PhysicsCharacterController, PhysicsMotionType, PhysicsRaycastResult, PhysicsShapeBox, PhysicsShapeContainer,
  PhysicsShapeType, PointLight, Quaternion, RawTexture, RawTexture3D, Ray, ReflectionProbe, RenderTargetTexture,
  SSAO2RenderingPipeline, SSRRenderingPipeline, Scene, SceneInstrumentation, SceneLoader, ShaderLanguage,
  ShaderMaterial, ShadowGenerator, SpotLight, StandardMaterial, Texture, TransformNode, Vector2, Vector3, Vector4,
  VertexBuffer, VertexData, VolumetricLightScatteringPostProcess,
};

window.BABYLON = BABYLON;
