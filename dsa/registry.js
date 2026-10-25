/**
 * MINERVA — DSA registry
 *
 * One entry per data structure / algorithm used in the project. The DSA tab
 * renders from this list, so adding a module means adding an entry here.
 *
 *   id       stable key; app.js maps it to a demo, a "Try it" action and live numbers
 *   group    heading the concept is listed under
 *   file     module in dsa/, shown as the source
 *   symbol   class or function whose source is excerpted
 *   usedIn   where it runs in MINERVA (shown next to the "Try it" button)
 *   summary  two or three plain sentences
 *   ops      [operation, time, space] rows for the complexity table
 */

export const DSA_GROUPS = ['Linear', 'Heaps', 'Trees', 'Graphs'];

export const DSA_CONCEPTS = [
  {
    id: 'stack',
    name: 'Stack',
    group: 'Linear',
    file: 'Stack.js',
    symbol: 'QueryHistoryManager',
    usedIn: 'SQL console: Undo / Redo through executed queries',
    summary:
      'A stack is last-in, first-out: you only add to and remove from the top. ' +
      'The SQL console keeps two stacks. Running a query pushes it onto the history stack; Undo pops it onto the redo stack, and Redo moves it back.',
    ops: [
      ['push', 'O(1); O(n) once the 50-query cap is reached (the oldest is dropped)', 'O(1)'],
      ['pop', 'O(1)', 'O(1)'],
      ['peek', 'O(1)', 'O(1)'],
    ],
  },
  {
    id: 'queue',
    name: 'Queue',
    group: 'Linear',
    file: 'Queue.js',
    symbol: 'Queue',
    usedIn: 'Alerts: the recent-alerts history (bell menu) keeps the last 30; the oldest drop off first',
    summary:
      'A queue is first-in, first-out: items join at the back and leave from the front. ' +
      'This one keeps a head and a tail index instead of calling Array.shift(), so removing from the front stays O(1).',
    ops: [
      ['enqueue', 'O(1)', 'O(1)'],
      ['dequeue', 'O(1)', 'O(1)'],
      ['peek', 'O(1)', 'O(1)'],
    ],
  },
  {
    id: 'priority-queue',
    name: 'Priority queue (binary heap)',
    group: 'Heaps',
    file: 'Queue.js',
    symbol: 'PriorityQueue',
    usedIn: 'Alerts: CRITICAL shown before WARNING before INFO; Dijkstra and Prim frontiers',
    summary:
      'A binary min-heap stored in an array: the parent of index i is at (i - 1) / 2, and every parent is more urgent than its children. ' +
      'The most urgent item is always at index 0. Equal priorities are broken by arrival order, so alerts of the same level stay first-come, first-served.',
    ops: [
      ['enqueue (sift up)', 'O(log n)', 'O(1)'],
      ['dequeue (sift down)', 'O(log n)', 'O(1)'],
      ['peek', 'O(1)', 'O(1)'],
    ],
  },
  {
    id: 'bst',
    name: 'Binary search tree',
    group: 'Trees',
    file: 'BinarySearchTree.js',
    symbol: 'rangeQuery',
    usedIn: 'Database → Minerals: assay range search (Fe, SiO2, Al2O3)',
    summary:
      'Each node holds a key; smaller keys go left, larger go right. A range search skips whole subtrees that cannot contain a match. ' +
      'The height depends on insertion order: random order gives about log n, sorted order degrades to a list.',
    ops: [
      ['insert', 'O(h)', 'O(1)'],
      ['search', 'O(h)', 'O(1)'],
      ['range query', 'O(h + k)', 'O(k)'],
    ],
  },
  {
    id: 'avl',
    name: 'AVL tree',
    group: 'Trees',
    file: 'AVLTree.js',
    symbol: '_rebalance',
    usedIn: 'Lease expiry index: leases keyed by end date',
    summary:
      'A binary search tree that checks its balance after every insert or delete and rotates whenever the two subtrees of a node differ in height by more than 1. ' +
      'Leases come out of the database already sorted by date, which is the worst case for a plain BST; the AVL tree stays at about log n height regardless.',
    ops: [
      ['insert', 'O(log n)', 'O(log n)'],
      ['delete', 'O(log n)', 'O(log n)'],
      ['range query', 'O(log n + k)', 'O(k)'],
    ],
  },
  {
    id: 'graph',
    name: 'Weighted graph',
    group: 'Graphs',
    file: 'Dijkstra.js',
    symbol: 'buildNearestNeighbourGraph',
    usedIn: 'Map → Transport network: mines linked to their 3 nearest mines',
    summary:
      'An undirected graph stored as an adjacency list: each mine maps to its neighbours and the distance to each. ' +
      'Edge weights are great-circle (haversine) kilometres. Linking each mine to its nearest neighbours keeps the graph sparse, so shortest paths are not just the direct line.',
    ops: [
      ['add edge', 'O(1)', 'O(1)'],
      ['neighbours of v', 'O(deg v)', 'O(1)'],
      ['build k-nearest', 'O(n² log n)', 'O(nk)'],
    ],
  },
  {
    id: 'dijkstra',
    name: "Dijkstra's shortest path",
    group: 'Graphs',
    file: 'Dijkstra.js',
    symbol: 'dijkstra',
    usedIn: 'Map → Shortest route between two mines',
    summary:
      'Repeatedly settles the closest unsettled node and relaxes its edges, using the priority queue as the frontier. ' +
      'Once a node is settled its distance is final, because all edge weights are non-negative. Stale heap entries are skipped instead of using decrease-key.',
    ops: [
      ['shortest path', 'O((V + E) log V)', 'O(V + E)'],
    ],
  },
  {
    id: 'prim',
    name: "Prim's minimum spanning tree",
    group: 'Graphs',
    file: 'MST.js',
    symbol: 'primMST',
    usedIn: 'Map → Minimum network, grown from a chosen mine',
    summary:
      'Grows one tree from a start mine, always adding the cheapest edge that leaves the tree. ' +
      'Candidate edges wait in the priority queue. The result is the shortest total length of links that connects every mine.',
    ops: [
      ['MST', 'O(E log V)', 'O(E)'],
    ],
  },
  {
    id: 'kruskal',
    name: "Kruskal's minimum spanning tree",
    group: 'Graphs',
    file: 'MST.js',
    symbol: 'kruskalMST',
    usedIn: 'Map → Minimum network, shortest links first',
    summary:
      'Sorts every edge by length and takes each one that joins two different components, skipping any that would close a loop. ' +
      'It reaches the same total as Prim but picks the edges in a different order.',
    ops: [
      ['sort edges', 'O(E log E)', 'O(E)'],
      ['MST', 'O(E α(V))', 'O(V)'],
    ],
  },
  {
    id: 'union-find',
    name: 'Union-find',
    group: 'Graphs',
    file: 'MST.js',
    symbol: 'UnionFind',
    usedIn: "Kruskal's algorithm: is this edge joining two separate groups?",
    summary:
      'Keeps a forest where each tree is one group. find() walks to the root; union() attaches the shorter tree under the taller one. ' +
      'Path compression flattens the tree on every find, so operations run in near-constant time.',
    ops: [
      ['find', 'O(α(n))', 'O(1)'],
      ['union', 'O(α(n))', 'O(1)'],
    ],
  },
];

export default { DSA_GROUPS, DSA_CONCEPTS };
