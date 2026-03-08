/**
 * Neural network node generation: spherical distribution with nearest-neighbor connections.
 * Used by the lib/3d system for supplementary node generation.
 */

export interface NetworkNode {
  x: number
  y: number
  z: number
  connections: number[]  // Indices of connected nodes
}

/**
 * Generate nodes distributed on a sphere and connect each to nearest neighbors.
 * @param count - Number of nodes to generate
 * @param minConnections - Minimum connections per node (3)
 * @param maxConnections - Maximum connections per node (5)
 * @returns Array of NetworkNode with connected indices
 */
export function generateNeuralNetwork(
  count: number = 80,
  minConnections: number = 3,
  maxConnections: number = 5
): NetworkNode[] {
  const nodes: NetworkNode[] = []

  // Generate nodes in spherical distribution
  for (let i = 0; i < count; i++) {
    const radius = 200 + Math.random() * 300
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI

    const x = radius * Math.sin(phi) * Math.cos(theta)
    const y = radius * Math.sin(phi) * Math.sin(theta)
    const z = radius * Math.cos(phi) - 250

    nodes.push({ x, y, z, connections: [] })
  }

  // Connect each node to its nearest neighbors
  for (let i = 0; i < nodes.length; i++) {
    const distances: { index: number; dist: number }[] = []

    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue
      const dx = nodes[i].x - nodes[j].x
      const dy = nodes[i].y - nodes[j].y
      const dz = nodes[i].z - nodes[j].z
      const dist = dx * dx + dy * dy + dz * dz
      distances.push({ index: j, dist })
    }

    // Sort by distance
    distances.sort((a, b) => a.dist - b.dist)

    // Connect to 3-5 nearest neighbors
    const numConnections = minConnections + Math.floor(Math.random() * (maxConnections - minConnections + 1))
    for (let k = 0; k < Math.min(numConnections, distances.length); k++) {
      const targetIndex = distances[k].index
      if (!nodes[i].connections.includes(targetIndex)) {
        nodes[i].connections.push(targetIndex)
      }
      // Ensure bidirectional connection
      if (!nodes[targetIndex].connections.includes(i)) {
        nodes[targetIndex].connections.push(i)
      }
    }
  }

  return nodes
}
