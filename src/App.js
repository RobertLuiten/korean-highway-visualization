import React, { useEffect, useState } from 'react';
import './App.css';
import { Neo4jProvider, useReadCypher } from 'use-neo4j';
import neo4j from 'neo4j-driver';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers';

/** My server's login information */
const URI = 'bolt://localhost:7687';
const USER = 'neo4j';
const PASSWORD = 'PASSWORD';

/** Neo4j driver! */
const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

function App() {
  return (
    <div>
      <Neo4jProvider driver={driver}>
        <DataVisualization />
      </Neo4jProvider>
    </div>
  );
}

/** Set these as needed! */
const DEFAULT_NODE_COLOR = [0, 0, 0];
const DEFAULT_ROUTE_COLOR = [0, 255, 0];

function DataVisualization() {
  const [data, setData] = useState(null);
  const [nodeB, setNodeB] = useState(null);
  const [highway, setHighway] = useState(null);
  const [shortestPath, setShortestPath] = useState(null);
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 1,
    pitch: 0,
    bearing: 0
  });
  const [shortestPathParams, setShortestPathParams] = useState(null);

  const { loading, records, error } = useReadCypher(`
    MATCH (from:Location)-[r:CONNECTS_TO]->(to:Location)
    RETURN from.name, from.number, to.name, to.number, 
           r.long1, r.lat1, r.long2, r.lat2, r.distance
  `);

  useEffect(() => {
    if (highway && nodeB && highway.name !== nodeB.name) {
      setShortestPathParams({ startName: highway.name, endName: nodeB.name });
    } else {
      setShortestPathParams(null);
    }
  }, [highway, nodeB]);

  /** This is just for loading the map, nothing with the querying! */
  useEffect(() => {
    if (records) {
      const locations = records.map(record => ({
        name: record.get('from.name'),
        number: record.get('from.number'),
        Long1: record.get('r.long1'),
        Lat1: record.get('r.lat1'),
        color: DEFAULT_NODE_COLOR
      }));

      const connections = records.map(record => ({
        name: record.get('from.name'),
        Long1: record.get('r.long1'),
        Lat1: record.get('r.lat1'),
        Long2: record.get('r.long2'),
        Lat2: record.get('r.lat2'),
        distance: record.get('r.distance'),
        color: DEFAULT_ROUTE_COLOR
      }));

      setData({ locations, connections });

      if (locations.length > 0) {
        setViewState(prevState => ({
          ...prevState,
          longitude: locations[5].Long1,
          latitude: locations[5].Lat1,
          zoom: 6.75
        }));
      }
    }
  }, [records]);

/** Let the magic begin! */
useEffect(() => {
    const fetchShortestPath = async () => {
      if (shortestPathParams) {
        const session = driver.session();
        try {
          const result = await session.run(`
            MATCH (start:Location {name: $startName}),
                  (end:Location {name: $endName}),
                  path = shortestPath((start)-[:CONNECTS_TO*]-(end))
            RETURN path, reduce(distance = 0, r IN relationships(path) | distance + r.distance) AS totalDistance
          `, {
            startName: shortestPathParams.startName,
            endName: shortestPathParams.endName
          });

          if (result.records.length > 0) {
            const path = result.records[0].get('path');
            const totalDistance = result.records[0].get('totalDistance');
            const pathConnections = path.segments.map(segment => (
              console.log(segment.relationship.properties),
              {
              Long1: segment.relationship.properties.long1,
              Lat1: segment.relationship.properties.lat1,
              Long2: segment.relationship.properties.long2,
              Lat2: segment.relationship.properties.lat2,
            }));
            console.log(pathConnections)

            setShortestPath({ connections: pathConnections, distance: totalDistance });
          }
        } finally {
          await session.close();
        }
      }
    };

    fetchShortestPath();
  }, [shortestPathParams]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return null;

  const layers = [
    new LineLayer({
      id: 'connections',
      data: data.connections,
      getSourcePosition: d => [d.Long1, d.Lat1],
      getTargetPosition: d => [d.Long2, d.Lat2],
      getColor: d => d.color,
      getWidth: 1
    }),
    (shortestPath && new LineLayer({
      id: 'shortestPath',
      data: shortestPath.connections,
      getSourcePosition: d => [d.Long1, d.Lat1],
      getTargetPosition: d => [d.Long2, d.Lat2],
      getColor: [255, 0, 0],
      getWidth: 3,
      key: shortestPath.distance
    })),
    new ScatterplotLayer({
      id: 'locations',
      data: data.locations,
      getPosition: d => [d.Long1, d.Lat1],
      getFillColor: d => d.color,
      getRadius: 1000,
      pickable: true,
      onClick: (info) => {
        if (info.object) {
          const { Long1, Lat1 } = info.object;
          if (!highway){
            setHighway(info.object);
          } else {
            setNodeB(info.object);
          }
          setViewState(prevState => ({
            ...prevState,
            longitude: Long1,
            latitude: Lat1,
            zoom: 10
          }));
        }
      }
    })
  ];

  const reset = () => {
    setHighway(null);
    setNodeB(null);
  }

  return (
    <div>
      <div style={{ backgroundColor: 'white', position: 'absolute', zIndex: 10, padding: 10, borderStyle: 'solid'}}>
        <h1 style={{ position: 'relative', zIndex: 10 }}>Korean Highways 2011 Visualization</h1>
        {highway ? <h2 style={{ position: 'relative', zIndex: 10 }}>Start Destination: {highway.name}</h2> : 
          <h2 style={{ position: 'relative', zIndex: 10 }}>Click on a highway to explore! (Wow!)</h2>}
        {nodeB && <h2 style={{ position: 'relative', zIndex: 10 }}>End Destination: {nodeB.name}</h2>}
        {shortestPath && highway && nodeB && (
          <h2 style={{ position: 'relative', zIndex: 10 }} key={shortestPath.distance}>
            Shortest Distance from {highway.name} to {nodeB.name}: {shortestPath.distance.toFixed(2)} km
          </h2>
        )}
        { highway && nodeB && <button onClick={() => reset()}>Plan New Route</button>}
      </div>
      <DeckGL
        initialViewState={viewState}
        controller={true}
        layers={layers}
        onViewStateChange={({ viewState }) => setViewState(viewState)}
        key={highway && nodeB ? `${highway.name}-${nodeB.name}` : 'default'}
      />
    </div>
  );
}

export default App;