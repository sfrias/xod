
import R from 'ramda';
import { sortGraph } from 'xod-core/utils/gmath';
import { PIN_DIRECTION, PIN_TYPE } from 'xod-core/project/constants';

// From: https://github.com/ramda/ramda/wiki/Cookbook#rename-keys-of-an-object
/**
 * Creates a new object with the own properties of the provided object, but the
 * keys renamed according to the keysMap object as `{oldKey: newKey}`.
 * When some key is not found in the keysMap, then it's passed as-is.
 *
 * Keep in mind that in the case of keys conflict is behaviour undefined and
 * the result may vary between various JS engines!
 *
 * @sig {a: b} -> {a: *} -> {b: *}
 */
const renameKeys = R.curry(
  (keysMap, obj) => R.reduce(
    (acc, key) => R.assoc(keysMap[key] || key, obj[key], acc),
    {},
    R.keys(obj)
  )
);

// :: [k] -> {k: v} -> v | Undefined -- returns a value in obj for
//    an existing key that found first in priorityKeys
const priorityValue = R.curry(
  (priorityKeys, obj) => {
    const key = R.head(R.intersection(priorityKeys, R.keys(obj)));
    return R.prop(key, obj);
  }
);

// :: ({String: Patch}, String) -> Int
// -- maxIdOf(project.patches, 'nodes') -> max .id of all nodes in all patches
const maxIdOf = (patches, key) => R.compose(
  R.reduce(R.max, 0),
  R.map(R.propOr(0, 'id')),
  R.reduce(R.concat, []),
  R.map(R.compose(R.values, R.propOr({}, key))),
  R.values
)(patches);

// -------------- TODO: move to xod-core? (with all other selectors) --------

const isInputNode = R.propSatisfies(R.test(/^core\/input/), 'typeId');
const isOutputNode = R.propSatisfies(R.test(/^core\/output/), 'typeId');

// :: Patch -> Boolean
const isPatchNodeType = R.compose(
  R.any(R.either(isInputNode, isOutputNode)),
  R.values,
  R.propOr({}, 'nodes')
);

// --------------------------------------------------------------------------
const dump = (title, data) => {
  /*
  console.log(title, JSON.stringify(data, null, '  '),
              '\n*************************************');
  */
};

/**
  * Transforms JSON data as it seen it *.xod files to
  * a shape expected by the runtime.
  *
  * @param {Object} project -- project from app world
  * @param {Array.<String>} implPlatforms -- allowed platforms to extract
  *   implementation for given in prioritized list. E.g. ['espruino', 'js'].
  */
export default function transform(project, implPlatforms = []) {

  const nodeTypes = R.propOr({}, 'nodeTypes', project);
  const nodeTypeByKey = key => R.propOr({}, key, nodeTypes);

  const allPatches = R.propOr({}, 'patches', project);

  // flat patch that merged from all non-patchnodes
  const mergedPatch = R.compose(
    R.omit('id'),
    R.reduce(R.mergeWith(R.merge), {}),
    R.filter(R.complement(isPatchNodeType)),
    R.values
  )(allPatches);

  // :: String -> {a} -- extacts a specific key branch from the merged patch
  const mergedEntities = key => R.propOr({}, key)(mergedPatch);

  const allNodes = mergedEntities('nodes');
  const allLinks = mergedEntities('links');

  // type PatchNode = {nodes :: [Node], links :: [Link]}

  // :: {patchNode.name: PatchNode}
  const patchNodesByName = R.compose(
    R.reduce(
      ((ns, n) =>
       isPatchNodeType(n)
       ? R.assoc(n.name, {
         links: R.values(n.links),
         nodes: R.values(n.nodes),
       }, ns)
       : ns),
      {}
    ),
    R.values
  )(allPatches);

  // :: Int -> PatchNode
  const getPatchNodeById = R.compose(
    R.prop(R.__, patchNodesByName),
    R.last, R.split('/'),
    R.prop('typeId'),
    R.prop(R.__, allNodes)
  );

  // :: Node -> Boolean
  // "true", if node is instance of one of @patchNodesByName
  // and its .typeId is not in @nodeTypes
  const isPatchNodeInstance = R.compose(
    R.both(
      R.complement(R.has(R.__, nodeTypes)),
      R.compose(
        R.any(R.__, R.keys(patchNodesByName)),
        type => name => RegExp('/' + name + '$').test(type)
      )
    ),
    R.propOr('', 'typeId')
  );

  let nodeIdSeq = maxIdOf(allPatches, "nodes") + 1;
  let linkIdSeq = maxIdOf(allPatches, "links") + 1;

  const patchNodeInstIds = R.compose(
    R.pluck('id'),
    R.filter(isPatchNodeInstance),
    R.values
  )(allNodes);

  const patchNodeInstInputLinks = R.pickBy(
    ({pins: [_, {nodeId}]}) => R.contains(nodeId, patchNodeInstIds),
    allLinks
  );
  const patchNodeInstOutputLinks = R.pickBy(
    ({pins: [{nodeId}, _]}) => R.contains(nodeId, patchNodeInstIds),
    allLinks
  );

  const linksToPins = R.compose(R.pluck('pins'), R.values);
  const patchNodeInstInputPins = linksToPins(patchNodeInstInputLinks);
  const patchNodeInstOutputPins = linksToPins(patchNodeInstOutputLinks);

  const cleanedLinks = R.omit(
    R.concat(R.keys(patchNodeInstInputLinks), R.keys(patchNodeInstOutputLinks)),
    allLinks
  );

  const cleanedNodes = R.omit(R.map(String, patchNodeInstIds), allNodes);

  // -----------------------------------------------------------

  let nodeList = [];
  let linkList = [];
  R.values(cleanedNodes).forEach(l => nodeList.push(l));
  R.values(cleanedLinks).forEach(l => linkList.push(l));

  const idsByTypeIdPrefix = prefix => R.compose(
    R.pluck('id'),
    R.filter(({typeId}) => R.test(RegExp('^' + prefix), typeId))
  );

  patchNodeInstIds.forEach(pnId => {
    const { nodes, links } = getPatchNodeById(pnId);

    // push nodes
    let oldToNewId = {};
    nodes.forEach(node => {
      const newId = nodeIdSeq;
      oldToNewId[node.id] = newId;
      nodeList.push(R.assoc('id', newId, node));
      nodeIdSeq += 1;
    });

    // push internal links
    links.forEach(link => {
      const {pins: [{nodeId: nFrom, pinKey: pFrom},
                    {nodeId: nTo, pinKey: pTo}]} = link;
      linkList.push({
        id: linkIdSeq,
        pins: [
          {pinKey: pFrom, nodeId: oldToNewId[nFrom]},
          {pinKey: pTo, nodeId: oldToNewId[nTo]},
        ]
      });
      linkIdSeq += 1;
    });

    // relink patchnode inputs
    R.filter(
      ([_, { nodeId }]) => nodeId == pnId,
      patchNodeInstInputPins
    ).forEach(
      ([source, {pinKey: terminal}]) => {
        const terminalId = R.last(R.split('_', terminal));
        linkList.push({
          id: linkIdSeq,
          pins: [
            source,
            {pinKey: 'IN', nodeId: oldToNewId[terminalId]},
          ]
        });
        linkIdSeq += 1;
      }
    );

    // relink patchnode outputs
    R.filter(
      ([{ nodeId }, _]) => nodeId == pnId,
      patchNodeInstOutputPins
    ).forEach(
      ([{pinKey: terminal}, target]) => {
        const terminalId = R.last(R.split('_', terminal));
        linkList.push({
          id: linkIdSeq,
          pins: [
            {pinKey: 'OUT', nodeId: oldToNewId[terminalId]},
            target,
          ]
        });
        linkIdSeq += 1;
      }
    );
  });
  // -----------------------------------------------------------

  const usedNodeTypeIds = R.pluck('typeId', nodeList);
  const usedNodeTypes = R.pick(usedNodeTypeIds, nodeTypes);

  // :: Node -> NodeType
  const nodeTypeByNode = R.compose(nodeTypeByKey, R.prop('typeId'));

  // :: NodeType -> {Key: NodeType.Pin}
  const nodeTypePins = R.propOr({}, 'pins');

  // :: String -> JSType -- converts pin string type name to native JS type object
  const nativeType = R.cond([
    [R.equals(PIN_TYPE.PULSE), R.always('<<identity>>')],
    [R.equals(PIN_TYPE.BOOL), R.always(Boolean)],
    [R.equals(PIN_TYPE.NUMBER), R.always(Number)],
    [R.equals(PIN_TYPE.STRING), R.always(String)],
    [R.T, () => { throw Error('Unknown type!'); }],
  ]);

  // :: {Key: NodeType.Pin} -> {Key: NodeType.Pin}
  const filterByDirection = R.compose(R.filter, R.propEq('direction'));

  // :: NodeType -> {Key: NodeType.Pin}
  const inputs = R.compose(filterByDirection(PIN_DIRECTION.INPUT), nodeTypePins);

  // :: NodeType -> {Key: (value -> JSType)}
  const inputTypes = R.compose(
    R.map(R.compose(nativeType, R.prop('type'))),
    inputs
  );

  // :: NodeType -> TransformedNodeType
  const transformedNodeType = nodeType => R.merge(
    R.pick(['pure'])(nodeType),
    R.objOf('inputTypes', inputTypes(nodeType))
  );

  // :: Node -> [Link]
  const outgoingLinks = (node) => R.filter(
    R.compose(
      R.propEq('nodeId', node.id),
      R.nth(0),
      R.prop('pins')
    )
  )(linkList);

  // :: Node -> {outKey: [Link]}
  const nodeOutLinks = R.compose(
    R.reduce(
      (outLinks, link) => {
        const [fromNode, toNode] = link.pins;

        return R.mergeWith(
          R.concat,
          {
            [fromNode.pinKey]: [{
              key: toNode.pinKey,
              nodeId: toNode.nodeId,
            }]
          },
          outLinks
        );
      },
      {}
    ),
    outgoingLinks
  );

  // :: Node -> TransformedNode
  const transformedNode = node => R.mergeAll([
    renameKeys(
      { typeId: 'implId', properties: 'props' },
      R.pick(['id', 'typeId', 'properties'])(node)
    ),
    R.compose(transformedNodeType, nodeTypeByNode)(node),
    R.objOf('outLinks', nodeOutLinks(node)),
  ]);

  const transformedNodes = R.compose(
    R.fromPairs,
    R.map(R.compose(
      n => [n.id, n],
      transformedNode
    ))
  )(nodeList);

  // :: NodeType -> ImplementationString
  const nodeTypeImpl = R.compose(
    priorityValue(implPlatforms),
    R.propOr({}, 'impl')
  );

  const impl = R.map(nodeTypeImpl, usedNodeTypes);

  // Link -> [NodeId]
  const linkNodeIds = R.compose(
    R.pluck('nodeId'),
    R.prop('pins')
  );

  const dagVertexes = R.pluck('id', nodeList);
  const dagEdges = R.map(linkNodeIds, linkList);
  const topology = sortGraph(dagVertexes, dagEdges);

  return {
    nodes: transformedNodes,
    impl,
    topology,
  };
}
