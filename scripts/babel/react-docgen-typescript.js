/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
/* eslint-disable @typescript-eslint/no-var-requires */

const propsParser = require('react-docgen-typescript');
const template = require('@babel/template');
const ts = require('typescript');
const glob = require('glob');
const util = require('util');

const files = [
  ...glob.sync('src/**/*.{ts,tsx}', { absolute: true }),
  ...glob.sync('src-docs/**/*.{ts,tsx}', { absolute: true }),
];

const options = {
  jsx: ts.JsxEmit.React,
};

const program = ts.createProgram(files, options);

module.exports = function() {
  return {
    pre() {
      this.fileProcessed = false;
    },
    visitor: {
      Program(path, state) {
        const { filename } = state.file.opts;

        if (this.fileProcessed) return;

        this.fileProcessed = true;

        // find if components extends types from other modules
        const componentExtends = [];

        // props that should be whitelisted even if its from an external module
        const whiteListedProps = ['children', 'className', 'aria-label'];

        // external modules whose props must be whitelisted
        const whiteListedParent = [
          'DragDropContextProps',
          'DraggableProps',
          'DroppableProps',
        ];

        let docgenResults = [];
        try {
          docgenResults = propsParser
            .withDefaultConfig({
              propFilter: (prop, component) =>
                filterProp(
                  prop,
                  component,
                  state,
                  whiteListedProps,
                  whiteListedParent,
                  componentExtends
                ),
              shouldExtractLiteralValuesFromEnum: true,
              shouldRemoveUndefinedFromOptional: true,
              savePropValueAsString: true,
            })
            .parseWithProgramProvider(filename, () => program);
          // eslint-disable-next-line no-empty
        } catch (e) {}

        if (state.get('childrenProp') && state.get('componentName')) {
          getChildrenTypeFromPropTypes(
            state.get('childrenProp'),
            state.get('componentName'),
            program,
            filename
          );
        }

        if (docgenResults.length === 0) return;
        docgenResults.forEach(function(docgenResult) {
          const exportName = docgenResult.displayName;

          if (!exportName) return;
          docgenResult.extends = componentExtends;
          path.node.body.push(
            template.default.ast(`          
            try{  
            ${exportName}.__docgenInfo = ${util.inspect(docgenResult, {
              showHidden: false,
              depth: null,
              maxArrayLength: null,
            })}
          } catch(e) {}
          `)
          );
        });
      },
    },
  };
};

/**
 * Filter props to remove props from node modules while keeping those whitelisted
 *
 * @param {*} prop
 * @param {*} state
 * @param {*} whiteListedProps
 * @param {*} whiteListedParent
 * @param {*} componentExtends
 */
function filterProp(
  prop,
  component,
  state,
  whiteListedProps,
  whiteListedParent,
  componentExtends
) {
  if (prop.name === 'children') {
    state.set('childrenProp', prop);
    state.set('componentName', component.name);
  }
  if (whiteListedProps.includes(prop.name)) {
    return true;
  }

  if (prop.type.name === 'enum') {
    const propValueArray = prop.type.value.map(type => type.value);
    const found = intrinsicValuesRaw.every(
      value => propValueArray.indexOf(value) >= 0
    );
    if (found) {
      prop.type.name = 'any HTML Element';
    }
  }
  if (prop.parent) {
    //Check if props are extended from other node module
    if (whiteListedParent.includes(prop.parent.name)) return true;
    if (
      prop.parent.name === 'DOMAttributes' &&
      !componentExtends.includes('DOMAttributes')
    ) {
      componentExtends.push('DOMAttributes');
    }
    if (prop.name.includes(whiteListedProps)) {
      return true;
    }
    return !prop.parent.fileName.includes('node_modules');
  }
  return true;
}

/**
 * Parser takes type generated for children prop from PropsWithChildren. Here
 * children prop is parsed from the interface used the component by reusing
 * typescript program.
 *
 * @param {*} initialProp
 * @param {*} componentName
 * @param {*} program
 * @param {*} filename
 */

function getChildrenTypeFromPropTypes(
  initialProp,
  componentName,
  program,
  filename
) {
  const source = program.getSourceFile(filename);
  const checker = program.getTypeChecker();

  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return;

  const components = checker.getExportsOfModule(moduleSymbol);
  const componentToParse = components.filter(
    component => component.escapedName === componentName
  )[0];

  if (
    !!componentToParse.declarations &&
    componentToParse.declarations.length === 0
  ) {
    return null;
  }

  const declaration =
    componentToParse.valueDeclaration ||
    (componentToParse.declarations && componentToParse.declarations[0]);

  const type = checker.getTypeOfSymbolAtLocation(componentToParse, declaration);

  // For stateless components there will be callSignatures.
  const callSignatures = type.getCallSignatures();
  if (callSignatures && callSignatures.length) {
    for (const sig of callSignatures) {
      const params = sig.getParameters();
      if (params.length === 0) {
        continue;
      }
      const propsParam = params[0];
      if (propsParam.name === 'props' || params.length === 1) {
        replaceProp(propsParam, checker, initialProp);
      }
    }
  } else {
    // For for statefull components there will be constructSignatures.
    const constructSignatures = type.getConstructSignatures();
    if (constructSignatures && constructSignatures.length) {
      for (const sig of constructSignatures) {
        const instanceType = sig.getReturnType();
        const props = instanceType.getProperty('props');
        if (props.valueDeclaration) {
          replaceProp(props, checker, initialProp);
        }
      }
    }
  }
}

/**
 * Replace children prop type and required from information from interface
 *
 * @param {*} props
 * @param {*} checker
 * @param {*} initialProp
 */
function replaceProp(props, checker, initialProp) {
  const propsType = checker.getTypeOfSymbolAtLocation(
    props,
    props.valueDeclaration
  );
  const propTypes = propsType.getProperties();
  const childrenProp = propTypes.filter(
    prop => prop.getName() === 'children'
  )[0];
  const prop = childrenProp.declarations.filter(
    declarations => declarations.parent.symbol.name !== 'DOMAttributes'
  )[0];
  if (prop) {
    prop.symbol.parent.members.forEach((value, key) => {
      if (key === 'children') {
        const propType = checker.getTypeOfSymbolAtLocation(
          value,
          value.valueDeclaration
        );
        const type = checker.typeToString(propType);
        initialProp.required = !prop.questionToken;
        initialProp.type.name = type.replace(' | undefined', '');
      }
    });
  }
}

const intrinsicValuesRaw = [
  '"a"',
  '"abbr"',
  '"address"',
  '"animate"',
  '"animateMotion"',
  '"animateTransform"',
  '"area"',
  '"article"',
  '"aside"',
  '"audio"',
];
