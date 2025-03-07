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
const DEFAULT_HIGHWAY_COLOR = [0, 255, 0];
const DEFAULT_ROUTE_COLOR = [255,0,0];
const START_NODE_COLOR = [255, 255, 0];
const END_NODE_COLOR = [255, 255, 0];

function DataVisualization() {
  const [data, setData] = useState(null);
  const [nodeB, setNodeB] = useState(null);
  const [highway, setHighway] = useState(null);
  const [shortestPath, setShortestPath] = useState(null);
  const [showDetails, setShowDetails] = useState(true);
  const [showAbout, setShowAbout] = useState(false);
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
        color: DEFAULT_HIGHWAY_COLOR
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
    /** Layer for all of the highway road segments */
    new LineLayer({
      id: 'connections',
      data: data.connections,
      getSourcePosition: d => [d.Long1, d.Lat1],
      getTargetPosition: d => [d.Long2, d.Lat2],
      getColor: d => d.color,
      getWidth: 1
    }),
    /** Layer for the route segments */
    (shortestPath && new LineLayer({
      id: 'shortestPath',
      data: shortestPath.connections,
      getSourcePosition: d => [d.Long1, d.Lat1],
      getTargetPosition: d => [d.Long2, d.Lat2],
      getColor: DEFAULT_ROUTE_COLOR,
      getWidth: 3,
      key: shortestPath.distance
    })),
    /** The layer for all of the highway nodes */
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
            setViewState(prevState => ({
              ...prevState,
              longitude: Long1,
              latitude: Lat1,
              zoom: 10
            }));
          } else if (info.object.name !== highway.name) {
            setNodeB(info.object);
            setViewState(prevState => ({
              ...prevState,
              longitude: (Long1 + highway.Long1) / 2,
              latitude: (Lat1 + highway.Lat1) / 2,
              zoom: 8
            }));
          }
        }
      }
    }),
    /** For the start destination node */
    new ScatterplotLayer({
      id: 'Start Location',
      data: highway ? [highway] : [],
      getPosition: d => [d.Long1, d.Lat1],
      getFillColor: d => START_NODE_COLOR,
      getRadius: 1000,
      pickable: true
    }),
    /** For end destination node */
    new ScatterplotLayer({
      id: 'Start Location',
      data: highway ? [nodeB] : [],
      getPosition: d => [d.Long1, d.Lat1],
      getFillColor: d => END_NODE_COLOR,
      getRadius: 1000,
      pickable: true
    })
  ];

  /** Basically resets so we can find new routes! */
  const reset = () => {
    setHighway(null);
    setNodeB(null);
    setShortestPath(null);
  }

  return (
    <div>
      {showDetails ? <div style={{ backgroundColor: 'white', position: 'absolute', zIndex: 10, padding: 10, borderStyle: 'solid'}}>
        <h1 style={{ position: 'relative', zIndex: 10 }}>Korean Highways 2011 Visualization</h1>
        {highway ? <h2 style={{ position: 'relative', zIndex: 10 }}>Start Destination: {highway.name}</h2> : 
          <h2 style={{ position: 'relative', zIndex: 10 }}>Click on a highway to explore!</h2>}
        {nodeB && <h2 style={{ position: 'relative', zIndex: 10 }}>End Destination: {nodeB.name}</h2>}
        {highway && nodeB && shortestPath &&
          <h2 style={{ position: 'relative', zIndex: 10 }} key={shortestPath.distance}>
            Route Distance from {highway.name} to {nodeB.name}: {shortestPath.distance.toFixed(2)} km
          </h2>
        }
        { highway && <button onClick={() => reset()}>Set New Start Destination</button>}
        { !showAbout && <button onClick={() => setShowAbout(true)}>About</button>}
        { showAbout && <div>
          <p>This is a visualization of the Korean highway System. Click on a dot to set your starting destination, then select
            different end destinations to see the distance between them! You can reset the start destination by clicking the "Set New Start Destination" button above!
            Happy Travels! - Rob
          </p>
          <button onClick={() => setShowAbout(false)}>Yeah yeah, I get it now. Let's explore!</button>
          </div>}
          <br></br>
          <button onClick={() => setShowDetails(false)}>Hide details</button>
      </div> : <div style={{ backgroundColor: 'white', position: 'absolute', zIndex: 10, padding: 10, borderStyle: 'solid'}}>
        <button onClick={() => setShowDetails(true)}>Show details</button></div>}
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