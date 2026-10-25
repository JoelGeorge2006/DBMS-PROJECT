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

export const DSA_GROUPS = ['Linear', 'Heaps', 'Hashing', 'Trees', 'Graphs', 'Geometry', 'Dynamic programming'];

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
    id: 'sliding-window',
    name: 'Sliding-window rate limiter',
    group: 'Linear',
    file: 'SlidingWindow.js',
    symbol: 'SlidingWindowLimiter',
    usedIn: 'Sign-in: 5 wrong PINs for one account from one address within 15 minutes lock that pair for 15 minutes (addresses and accounts have higher limits too)',
    summary:
      'Each key (account + address, an address, or an account) has a queue of the times of its recent failed sign-ins. ' +
      'Times older than the 15-minute window are dequeued from the front; when the queue reaches the limit the key is locked for 15 minutes from that moment. ' +
      'Each time is enqueued and dequeued once, so the work per attempt is constant on average.',
    ops: [
      ['record failure', 'O(1) amortised', 'O(limit) per key'],
      ['check', 'O(1) amortised', 'O(1)'],
    ],
  },
  {
    id: 'priority-queue',
    name: 'Priority queue (binary heap)',
    group: 'Heaps',
    file: 'Queue.js',
    symbol: 'PriorityQueue',
    usedIn: 'Toasts: CRITICAL before WARNING before INFO; the notification scheduler (rules keyed by next check time, lib/notifications.js); Dijkstra and Prim frontiers',
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
    id: 'lru-cache',
    name: 'LRU cache',
    group: 'Hashing',
    file: 'LRUCache.js',
    symbol: 'LRUCache',
    usedIn: 'Sign-in sessions: every API request looks up its session; recent sessions are answered from the cache',
    summary:
      'A hash map from key to node gives O(1) lookup; a doubly linked list keeps the nodes in order of use. ' +
      'Reading or writing a key moves its node to the front; when the cache is full the node at the back (least recently used) is evicted. ' +
      'Entries also expire with their session.',
    ops: [
      ['get (move to front)', 'O(1)', 'O(1)'],
      ['set (evict back if full)', 'O(1)', 'O(1)'],
      ['delete', 'O(1)', 'O(1)'],
    ],
  },
  {
    id: 'hash-set',
    name: 'Hash set (role permissions)',
    group: 'Hashing',
    file: 'auth.js',
    path: 'lib/auth.js',
    symbol: 'ROLES',
    usedIn: 'Roles: each role has a set of permissions; the server checks set.has(permission) before admin-only routes such as the SQL console',
    summary:
      'A set stores unique values in a hash table, so asking whether it contains a value takes constant time on average, however many values it holds. ' +
      'Each role (admin, inspector, surveyor, viewer) maps to a Set of permission names.',
    ops: [
      ['has', 'O(1) average', 'O(1)'],
      ['add', 'O(1) average', 'O(1)'],
    ],
  },
  {
    id: 'trie',
    name: 'Trie (prefix tree) with top-k',
    group: 'Trees',
    file: 'Trie.js',
    symbol: 'Trie',
    usedIn: 'Search bar: suggestions for mines, minerals, places, companies and leases as you type',
    summary:
      'Every word of every name is inserted one letter per level, so all words sharing a prefix share a path. ' +
      'Each node also keeps the best k entries below it in a small min-heap, so a prefix lookup walks only the prefix and reads that list, without visiting the subtree. ' +
      'Several words ("north keo") are matched by checking the other words against the shortest list.',
    ops: [
      ['insert word', 'O(L log k)', 'O(L) new nodes at most'],
      ['suggest prefix', 'O(P + k log k)', 'O(k)'],
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
    symbol: 'connectComponents',
    usedIn: 'Map → Transport network: each mine linked to its 3 nearest mines, plus links joining separate clusters',
    summary:
      'An undirected graph stored as an adjacency list: each mine maps to its neighbours and the distance to each, in great-circle (haversine) kilometres. ' +
      'Nearest-neighbour links alone leave separate clusters (one per coalfield), so union-find finds the clusters and, Borůvka-style, each round adds the shortest link from every cluster to another until all mines are connected.',
    ops: [
      ['add edge', 'O(1)', 'O(1)'],
      ['neighbours of v', 'O(deg v)', 'O(1)'],
      ['build k-nearest', 'O(n² log n)', 'O(nk)'],
      ['join clusters', 'O(n² log n): O(log n) rounds of O(n²)', 'O(n)'],
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
  {
    id: 'grid-cluster',
    name: 'Grid clustering',
    group: 'Geometry',
    file: 'ConvexHull.js',
    symbol: 'gridCluster',
    usedIn: 'Map: below zoom 9, mines that would overlap on screen become one numbered bubble, coloured by the most common mineral',
    summary:
      'Each mine is projected to screen pixels at the current zoom and dropped into the hash-map bucket of its 60-pixel grid cell. ' +
      'Each bucket becomes one cluster. It runs again whenever the zoom changes, so clusters split as you zoom in.',
    ops: [['cluster n points', 'O(n)', 'O(n)']],
  },
  {
    id: 'convex-hull',
    name: 'Convex hull (monotone chain)',
    group: 'Geometry',
    file: 'ConvexHull.js',
    symbol: 'convexHull',
    usedIn: 'Map: hovering a cluster outlines the area its mines cover',
    summary:
      'The smallest convex polygon containing all points. Points are sorted by x, then the lower and upper chains are built, ' +
      'popping the last point whenever it would make a clockwise turn.',
    ops: [['hull of n points', 'O(n log n)', 'O(n)']],
  },
  {
    id: 'levenshtein',
    name: 'Levenshtein edit distance',
    group: 'Dynamic programming',
    file: 'Trie.js',
    symbol: 'levenshtein',
    usedIn: 'Search bar: a word with no match is corrected to the closest indexed word ("keonjar" → "keonjhar")',
    summary:
      'The fewest single-letter insertions, deletions or substitutions that turn one word into another. ' +
      'Cell (i, j) of the table is the distance between the first i letters of one word and the first j of the other, built from its three neighbours. ' +
      'Only two rows are kept, and the computation stops early once every value in a row is over the allowed number of edits (1 or 2).',
    ops: [
      ['distance', 'O(m · n)', 'O(n): two rows'],
      ['with cutoff d', 'stops when a row min exceeds d', 'O(n)'],
    ],
  },
];

export default { DSA_GROUPS, DSA_CONCEPTS };