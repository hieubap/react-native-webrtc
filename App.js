import React, {useEffect, useRef} from 'react';

import {
  Button,
  Dimensions,
  KeyboardAvoidingView,
  SafeAreaView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import {useState} from 'react';

import firestore from '@react-native-firebase/firestore';

const {width, height} = Dimensions.get('screen');
const App = () => {
  const [remoteStream, setRemoteStream] = useState(null);
  const [webcamStarted, setWebcamStarted] = useState(false);
  const [screen, setScreen] = useState(1);
  const [localStream, setLocalStream] = useState(null);
  const [join, setJoin] = useState(false);
  const [channelId, setChannelId] = useState(null);
  const [callId, setCallId] = useState('');
  const pc = useRef();
  const servers = {
    iceServers: [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
        ],
      },
      {
        url: 'turn:14.225.205.222:3478',
        username: 'mainam',
        credential: '123456',
      },
    ],
    iceCandidatePoolSize: 10,
  };

  const startWebcam = async () => {
    setScreen(3);
    pc.current = new RTCPeerConnection(servers);
    const local = await mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    pc.current.addStream(local);
    setLocalStream(local);
    const remote = new MediaStream();
    setRemoteStream(remote);

    // Push tracks from local stream to peer connection
    local.getTracks().forEach(track => {
      console.log(pc.current.getLocalStreams());
      pc.current.getLocalStreams()[0].addTrack(track);
    });

    // Pull tracks from remote stream, add to video stream
    pc.current.ontrack = event => {
      event.streams[0].getTracks().forEach(track => {
        remote.addTrack(track);
      });
    };

    pc.current.onaddstream = event => {
      setRemoteStream(event.stream);
    };
    InCallManager.setSpeakerphoneOn(true);
    setWebcamStarted(true);
    if (join) {
      joinCall();
    } else {
      startCall();
    }
  };

  const startCall = async () => {
    const channelDoc = firestore().collection('channels').doc(callId);
    const offerCandidates = channelDoc.collection('offerCandidates');
    const answerCandidates = channelDoc.collection('answerCandidates');

    setChannelId(channelDoc.id);

    pc.current.onicecandidate = async event => {
      if (event.candidate) {
        await offerCandidates.add(event.candidate.toJSON());
      }
    };

    //create offer
    const offerDescription = await pc.current.createOffer();
    await pc.current.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await channelDoc.set({offer});

    // Listen for remote answer
    channelDoc.onSnapshot(snapshot => {
      const data = snapshot.data();
      if (!pc.current.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.current.setRemoteDescription(answerDescription);
      }
    });

    // When answered, add candidate to peer connection
    answerCandidates.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.current.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  };

  const joinCall = async () => {
    const channelDoc = firestore().collection('channels').doc(channelId);
    const offerCandidates = channelDoc.collection('offerCandidates');
    const answerCandidates = channelDoc.collection('answerCandidates');

    pc.current.onicecandidate = async event => {
      if (event.candidate) {
        await answerCandidates.add(event.candidate.toJSON());
      }
    };

    const channelDocument = await channelDoc.get();
    const channelData = channelDocument.data();

    const offerDescription = channelData.offer;

    await pc.current.setRemoteDescription(
      new RTCSessionDescription(offerDescription),
    );

    const answerDescription = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await channelDoc.update({answer});

    offerCandidates.onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.current.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  };

  const changeCall = text => {
    if (/^[a-zA-Z0-9]+$/.test(text) || text === '') {
      setCallId(text);
    }
  };

  const onStartCall = () => {
    // setWebcamStarted(true);
    setScreen(2);
    setJoin(false);
  };

  const onJoinCall = () => {
    // setWebcamStarted(true);
    setScreen(2);
    setJoin(true);
  };
  return (
    <KeyboardAvoidingView style={styles.body} behavior="height">
      <SafeAreaView>
        <View style={styles.buttons}>
          {screen === 1 && (
            <>
              <TextInput
                value={callId}
                placeholder="Call ID: A-Z,a-z,0-9"
                minLength={45}
                style={{
                  width: width * 0.5,
                  borderWidth: 1,
                  marginBottom: 15,
                  padding: 5,
                }}
                onChangeText={newText => changeCall(newText)}
              />
              <Button title="Start call" onPress={onStartCall} />
              <TextInput
                value={channelId}
                placeholder="Call ID: A-Z,a-z,0-9"
                minLength={45}
                style={{
                  width: width * 0.5,
                  borderWidth: 1,
                  marginBottom: 15,
                  padding: 5,
                }}
                onChangeText={newText => setChannelId(newText)}
              />
              <Button title="Join call" onPress={onJoinCall} />
            </>
          )}
          {screen === 2 && (
            <>
              <Button title="Start webcam" onPress={startWebcam} />
              {/* <TextInput
                value={callId}
                placeholder="Call ID: A-Z,a-z,0-9"
                minLength={45}
                style={{
                  width: width * 0.5,
                  borderWidth: 1,
                  marginBottom: 15,
                  padding: 5,
                }}
                onChangeText={newText => changeCall(newText)}
              /> */}
            </>
          )}
          {/* {screen === 3 && (
            <View style={{flexDirection: 'row'}}>
              <Button title="Join call" onPress={joinCall} />
              <TextInput
                value={channelId}
                placeholder="callId"
                minLength={45}
                style={{borderWidth: 1, padding: 5}}
                onChangeText={newText => setChannelId(newText)}
              />
            </View>
          )} */}
        </View>
        {remoteStream && (
          <RTCView
            streamURL={remoteStream?.toURL()}
            style={styles.stream}
            objectFit="cover"
            mirror
          />
        )}

        {localStream && (
          <RTCView
            streamURL={localStream?.toURL()}
            style={styles.stream1}
            objectFit="contain"
            mirror
          />
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  body: {
    backgroundColor: '#fff',

    justifyContent: 'center',
    alignItems: 'center',
    ...StyleSheet.absoluteFill,
  },
  stream1: {
    flex: 2,
    top: 40,
    right: 10,
    position: 'absolute',
    width: width * 0.3,
    height: height * 0.3,
  },
  stream: {
    flex: 2,
    width: width,
    height: height - 50,
  },
  buttons: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
});

export default App;
