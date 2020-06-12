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

const files = glob.sync('src/**/*.{ts,tsx}', { absolute: true });
const program = ts.createProgram(files, {});

module.exports = function() {
  return {
    visitor: {
      Program(path, state) {
        const { filename } = state.file.opts;

        // these files causing some issues needs to fix
        if (filename.includes('index.ts')) return;
        if (filename.includes('flex_item.tsx')) return;
        if (filename.includes('flex_grid.tsx')) return;

        // find if components extends types from other modules
        const componentExtends = [];

        let docgenResults = [];
        try {
          docgenResults = propsParser
            .withDefaultConfig({
              propFilter: prop => {
                if (prop.parent) {
                  if (
                    prop.parent.name === 'DOMAttributes' &&
                    !componentExtends.includes('DOMAttributes')
                  ) {
                    componentExtends.push('DOMAttributes');
                  }
                  return !prop.parent.fileName.includes('node_modules');
                }
                return true;
              },
              shouldExtractLiteralValuesFromEnum: true,
              shouldRemoveUndefinedFromOptional: true,
            })
            .parseWithProgramProvider(filename, () => program);
        } catch (e) {
          console.log(e);
        }
        if (docgenResults.length === 0) return;
        docgenResults.forEach(function(docgenResult) {
          const exportName = docgenResult.displayName;

          // Forwardref components extracted export name = 'ForwardRefExoticComponent'
          if (exportName === 'ForwardRefExoticComponent') {
            return;
          }
          if (!exportName) return;
          docgenResult.extends = componentExtends;
          path.node.body.push(
            template.default.ast(`          
            try{  
            ${exportName}.__docgenInfo = ${util.inspect(docgenResult, {
              showHidden: false,
              depth: null,
            })}
          } catch(e) {}
          `)
          );
        });
      },
    },
  };
};