import { getSequenceFlatMapWithInterruptions } from '../utils/getSequenceFlatMap';
import { LibraryConfigWithInheritanceMetadata } from './libraryParser';
import {
  IndividualComponent,
  LintConfig,
  ParsedConfig,
  StudyConfig,
} from './types';
import { isDynamicBlock, isInheritedComponent } from './utils';

interface Context {
  studyConfig: StudyConfig;
  importedLibraries: Record<string, LibraryConfigWithInheritanceMetadata>,
  lintConfig: LintConfig;
  errors: ParsedConfig<StudyConfig>['errors'];
  warnings: ParsedConfig<StudyConfig>['warnings'];
}

function isUrlConditionalBlock(sequence: StudyConfig['sequence']): boolean {
  return sequence.conditional === true && Boolean(sequence.id);
}

function hasConditionalBlock(sequence: StudyConfig['sequence']): boolean {
  if (isUrlConditionalBlock(sequence)) {
    return true;
  }

  if (isDynamicBlock(sequence)) {
    return false;
  }

  return sequence.components.some((component) => (
    typeof component !== 'string'
    && hasConditionalBlock(component)
  ));
}

function hasConditionalBlockInsideRestrictedOrderAncestor(
  sequence: StudyConfig['sequence'],
  hasRestrictedOrderAncestor = false,
): boolean {
  if (hasRestrictedOrderAncestor && isUrlConditionalBlock(sequence)) {
    return true;
  }

  if (isDynamicBlock(sequence)) {
    return false;
  }

  const childHasRestrictedOrderAncestor = hasRestrictedOrderAncestor
    || sequence.order === 'random'
    || sequence.order === 'latinSquare';

  return sequence.components.some((component) => (
    typeof component !== 'string'
    && hasConditionalBlockInsideRestrictedOrderAncestor(component, childHasRestrictedOrderAncestor)
  ));
}

function verifyConditionalBlocks(context: Context) {
  const hasConditional = hasConditionalBlock(context.studyConfig.sequence);
  const hasConditionalInsideRestrictedOrderAncestor = hasConditionalBlockInsideRestrictedOrderAncestor(
    context.studyConfig.sequence,
  );

  if (hasConditional && hasConditionalInsideRestrictedOrderAncestor) {
    context.errors.push({
      message: 'Conditional URL parameter assignment cannot be combined with random or latinSquare sequence ordering',
      instancePath: '/sequence/',
      params: { action: 'Use fixed ordering when using conditional blocks, or remove conditional blocks' },
      category: 'sequence-validation',
    });
  }
}

// Warn if the default contact email is left in the config and the study is not hosted on a known ReVISit domain
function verifyContactEmail(context: Context) {
  const DEFAULT_CONTACT_EMAIL = 'contact@revisit.dev';
  const REVISIT_DOMAINS = ['revisit.dev', 'vdl.sci.utah.edu'];
  const LOCAL_DEVELOPMENT_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isRevisitDomain = REVISIT_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  const isLocalDevelopment = LOCAL_DEVELOPMENT_HOSTNAMES.has(hostname);
  if (context.studyConfig.uiConfig.contactEmail === DEFAULT_CONTACT_EMAIL && !isRevisitDomain && !isLocalDevelopment) {
    context.warnings.push({
      message: `The contact email is set to the default value \`${DEFAULT_CONTACT_EMAIL}\`. Please update it to your own email address.`,
      instancePath: '/uiConfig/contactEmail',
      params: { action: 'Update the contactEmail field in uiConfig to your own email address' },
      category: 'default-contact-email',
    });
  }
}

// Verify components are well defined
function verifyComponents(context: Context) {
  Object.entries(context.studyConfig.components)
    .forEach(([componentName, component]) => {
      const isImportedLibraryComponent = componentName.startsWith('$') && componentName.includes('.components.');

      // Verify baseComponent is defined in baseComponents object
      if (isInheritedComponent(component) && !context.studyConfig.baseComponents?.[component.baseComponent]) {
        context.errors.push({
          message: `Base component \`${component.baseComponent}\` is not defined in baseComponents object`,
          instancePath: '/baseComponents/',
          params: { action: 'Add the base component to the baseComponents object' },
          category: 'undefined-base-component',
        });
      }

      const baseComponent = isInheritedComponent(component)
        ? context.studyConfig.baseComponents?.[component.baseComponent]
        : undefined;
      const resolvedComponent: Partial<IndividualComponent> = {
        ...(baseComponent || {}),
        ...component,
      };

      const isInheritedFromImportedLibrary = isInheritedComponent(component)
        && component.baseComponent.startsWith('$')
        && component.baseComponent.includes('.components.');

      const isUsingSidebarInOwnComponent = component.instructionLocation === 'sidebar'
        || component.nextButtonLocation === 'sidebar'
        || component.response?.some((r) => 'location' in r && r.location === 'sidebar');
      const hasOwnSidebarOverride = component.withSidebar !== undefined;

      // Verify sidebar is enabled if component uses sidebar locations
      // Imported library components are validated in verifyLibraryUsage to avoid duplicate warnings.
      if (!isImportedLibraryComponent && (!isInheritedFromImportedLibrary || isUsingSidebarInOwnComponent || hasOwnSidebarOverride)) {
        const sidebarDisabled = !(resolvedComponent.withSidebar ?? context.studyConfig.uiConfig.withSidebar);
        const isUsingSidebar = resolvedComponent.instructionLocation === 'sidebar'
          || resolvedComponent.nextButtonLocation === 'sidebar'
          || resolvedComponent.response?.some((r) => 'location' in r && r.location === 'sidebar');

        if (sidebarDisabled && isUsingSidebar) {
          const instancePath = component.withSidebar === false
            ? '/components/'
            : baseComponent?.withSidebar === false
              ? '/baseComponents/'
              : '/uiConfig/';
          context.warnings.push({
            message: `Component \`${componentName}\` uses sidebar locations but sidebar is disabled`,
            instancePath,
            params: { action: 'Enable the sidebar or move the location to belowStimulus or aboveStimulus' },
            category: 'disabled-sidebar',
          });
        }
      }
    });
}

// Verify sequence is well defined
function verifySequences(context: Context) {
  const usedComponents = getSequenceFlatMapWithInterruptions(context.studyConfig.sequence);

  usedComponents.forEach((component) => {
    // Verify component is defined in components object
    if (!context.studyConfig.components[component]) {
      if (context.studyConfig.baseComponents?.[component]) {
        context.errors.push({
          message: `Component \`${component}\` is a base component and cannot be used in the sequence`,
          instancePath: '/sequence/',
          params: { action: 'Remove the base component from the sequence' },
          category: 'sequence-validation',
        });
      } else {
        context.errors.push({
          message: `Component \`${component}\` is not defined in components object`,
          instancePath: '/components/',
          params: { action: 'Add the component to the components object' },
          category: 'undefined-component',
        });
      }
    }
  });

  // Warnings for components that are defined but not used in the sequence
  Object.keys(context.studyConfig.components)
    .filter((componentName) => (
      !usedComponents.includes(componentName)
      && !componentName.includes('.sequences.')
      && !componentName.includes('.components.')
    ))
    .forEach((componentName) => {
      context.warnings.push({
        message: `Component \`${componentName}\` is defined in components object but not used deterministically in the sequence`,
        instancePath: '/components/',
        params: { action: 'Remove the component from the components object or add it to the sequence' },
        category: 'unused-component',
      });
    });
}

// Recursive function to verify that the skip.to component exists after the block it is used in
// When we encounter a skip block, add the skip.to component to the skipTargets array
// When we then encounter a component that is in the skipTargets array, remove it from the array
// Return the array of skipTargets at the end of the sequence
function verifyStudySkip(
  context: Context,
  sequence: StudyConfig['sequence'],
  skipTargets: string[],
) {
  const removeTargetInPlace = (targetName: string) => {
    // Walk backward so removing items does not affect yet-to-visit indices.
    for (let index = skipTargets.length - 1; index >= 0; index -= 1) {
      if (skipTargets[index] === targetName) {
        skipTargets.splice(index, 1);
      }
    }
  };

  if (isDynamicBlock(sequence)) {
    return;
  }

  // Base case: empty sequence
  if (sequence.components.length === 0) {
    // Push a warning for an empty components array
    context.warnings.push({
      message: 'Sequence has an empty components array',
      instancePath: '/sequence/',
      params: { action: 'Remove empty components block or add components to the sequence' },
      category: 'sequence-validation',
    });
    return;
  }

  // If the block has an ID, remove it from the skipTargets array
  if (sequence.id) {
    removeTargetInPlace(sequence.id);
  }

  // Recursive case: sequence has at least one component
  sequence.components.forEach((component) => {
    if (typeof component === 'string') {
      // If the component is a string, check if it is in the skipTargets array
      if (skipTargets.includes(component)) {
        removeTargetInPlace(component);
      }
    } else {
      // Recursive case: component is a block
      verifyStudySkip(context, component, skipTargets);
    }
  });

  // If this block has a skip, add the skip.to component to the skipTargets array
  if (sequence.skip && sequence.skip.length > 0) {
    skipTargets.push(...sequence.skip.map((skip) => skip.to).filter((target) => target !== 'end'));
  }
}

// Verify skip blocks are well defined
function verifySkipBlocks(context: Context) {
  const missingSkipTargets: string[] = [];
  verifyStudySkip(context, context.studyConfig.sequence, missingSkipTargets);
  missingSkipTargets.forEach((skipTarget) => {
    context.errors.push({
      message: `Skip target \`${skipTarget}\` does not occur after the skip block it is used in`,
      instancePath: '/sequence/',
      params: { action: 'Add the target to the sequence after the skip block' },
      category: 'skip-validation',
    });
  });
}

// This function verifies that the library usage in the study config is valid
function verifyLibraryUsage(context: Context) {
  const allLibraryComponentNames = new Set(
    Object.values(context.importedLibraries).flatMap((libraryData) => Object.keys(libraryData.components)),
  );
  const usedLibraryComponentNames = new Set<string>();
  const componentsToVisit = [...getSequenceFlatMapWithInterruptions(context.studyConfig.sequence)];
  const visited = new Set<string>();

  while (componentsToVisit.length > 0) {
    const currentComponentName = componentsToVisit.pop()!;
    if (!visited.has(currentComponentName)) {
      visited.add(currentComponentName);

      if (allLibraryComponentNames.has(currentComponentName)) {
        usedLibraryComponentNames.add(currentComponentName);
      }

      const currentComponent = context.studyConfig.components[currentComponentName];
      if (currentComponent && isInheritedComponent(currentComponent)) {
        componentsToVisit.push(currentComponent.baseComponent);
      }
    }
  }

  Object.entries(context.importedLibraries).forEach(([library, libraryData]) => {
    // Verify that the library components are well defined
    Object.entries(libraryData.components).forEach(([componentName, component]) => {
      const baseComponentRef = isInheritedComponent(component)
        ? component.baseComponent
        : libraryData.__revisitInheritedComponentMetadata?.[componentName]?.baseComponent;
      const ownWithSidebar = isInheritedComponent(component)
        ? component.withSidebar
        : libraryData.__revisitInheritedComponentMetadata?.[componentName]?.withSidebar;

      // Verify baseComponent is defined in baseComponents object
      if (baseComponentRef && !libraryData.baseComponents?.[baseComponentRef]) {
        context.errors.push({
          message: `Base component \`${baseComponentRef}\` is not defined in baseComponents object in library \`${library}\``,
          instancePath: `/importedLibraries/${library}/baseComponents/`,
          params: { action: 'Add the base component to the baseComponents object' },
          category: 'undefined-base-component',
        });
      }

      if (!usedLibraryComponentNames.has(componentName)) {
        return;
      }

      const baseComponent = baseComponentRef
        ? libraryData.baseComponents?.[baseComponentRef]
        : undefined;
      const resolvedComponent: Partial<IndividualComponent> = {
        ...(baseComponent || {}),
        ...component,
      };

      // Verify sidebar is enabled if component uses sidebar locations
      const sidebarDisabled = !(resolvedComponent.withSidebar ?? context.studyConfig.uiConfig.withSidebar);
      const isUsingSidebar = resolvedComponent.instructionLocation === 'sidebar'
        || resolvedComponent.nextButtonLocation === 'sidebar'
        || resolvedComponent.response?.some((r) => 'location' in r && r.location === 'sidebar');

      if (sidebarDisabled && isUsingSidebar) {
        const instancePath = ownWithSidebar === false
          ? `/importedLibraries/${library}/components/`
          : baseComponent?.withSidebar === false
            ? `/importedLibraries/${library}/baseComponents/`
            : `/importedLibraries/${library}/uiConfig/`;
        context.warnings.push({
          message: `Component \`${componentName}\` in library \`${library}\` uses sidebar locations but sidebar is disabled`,
          instancePath,
          params: { action: 'Enable the sidebar or move the location to belowStimulus or aboveStimulus' },
          category: 'disabled-sidebar',
        });
      }
    });
  });
}

// Verify that screen recording permissions are properly requested
function verifyScreenRecordingPermissions(context: Context) {
  const screenRecordingPermissionComponentName = '$screen-recording.components.screenRecordingPermission';

  if (!context.studyConfig.uiConfig.recordScreen) {
    return;
  }

  const usedComponents = getSequenceFlatMapWithInterruptions(context.studyConfig.sequence);

  if (!usedComponents.includes(screenRecordingPermissionComponentName)) {
    context.errors.push({
      message: '`recordScreen` is set, but the screen recording permission component is missing',
      instancePath: '/sequence/',
      params: { action: `Add the \`${screenRecordingPermissionComponentName}\` component here` },
      category: 'sequence-validation',
    });
  }
}

// Verify that the demographics questions comes last in the sequence
function verifyDemographicsQuestions(context: Context) {
  const demographicsComponentName = '$demographics.components.demographics';

  const usedComponents = getSequenceFlatMapWithInterruptions(context.studyConfig.sequence);

  const index = usedComponents.indexOf(demographicsComponentName);

  if (index !== -1 && index !== usedComponents.length - 1) {
    context.warnings.push({
      message: 'Demographics questions should come last in the sequence',
      instancePath: '/sequence/',
      params: { action: `Move the \`${demographicsComponentName}\` component to the end` },
      category: 'sequence-validation',
    });
  }
}

const verifyPasses = [
  {
    id: 'conditional-blocks',
    verify: verifyConditionalBlocks,
    defaultEnabled: true,
  },
  {
    id: 'contact-email',
    verify: verifyContactEmail,
    defaultEnabled: true,
  },
  {
    id: 'components',
    verify: verifyComponents,
    defaultEnabled: true,
  },
  {
    id: 'sequences',
    verify: verifySequences,
    defaultEnabled: true,
  },
  {
    id: 'skip-blocks',
    verify: verifySkipBlocks,
    defaultEnabled: true,
  },
  {
    id: 'library-usage',
    verify: verifyLibraryUsage,
    defaultEnabled: true,
  },
  {
    id: 'screen-recording-permissions',
    verify: verifyScreenRecordingPermissions,
    defaultEnabled: true,
  },
  {
    id: 'demographics',
    verify: verifyDemographicsQuestions,
    defaultEnabled: false,
  },
];

// This function verifies the study config file satisfies conditions that are not covered by the schema
export function verifyStudyConfig(studyConfig: StudyConfig, importedLibraries: Record<string, LibraryConfigWithInheritanceMetadata>, lintConfig: LintConfig) {
  const errors: ParsedConfig<StudyConfig>['errors'] = [];
  const warnings: ParsedConfig<StudyConfig>['warnings'] = [];

  const context: Context = {
    studyConfig,
    importedLibraries,
    lintConfig,
    errors,
    warnings,
  };

  for (const pass of verifyPasses) {
    let enabled = pass.defaultEnabled;
    if (lintConfig.enabled?.includes(pass.id)) enabled = true;
    if (lintConfig.disabled?.includes(pass.id)) enabled = false;

    if (enabled) {
      pass.verify(context);
    }
  }

  return { errors, warnings };
}
