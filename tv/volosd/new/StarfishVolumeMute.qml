/* @@@LICENSE
 *
 * Copyright (c) 2015-2018 LG Electronics, Inc.
 *
 * Confidential computer software. Valid license from LG required for
 * possession, use or copying. Consistent with FAR 12.211 and 12.212,
 * Commercial Computer Software, Computer Software Documentation, and
 * Technical Data for Commercial Items are licensed to the U.S. Government
 * under vendor's standard commercial license.
 *
 * LICENSE@@@ */

import QtQuick 2.4
import WebOSCompositorBase 1.0
import WebOSCompositor 1.0

BaseView {
    id: root
    width: Settings.local.volume.bgCircleDiameter
    height: width
    anchors.right: parent.right
    anchors.rightMargin: Settings.local.volume.rightMargin
    y: volumeMuteDefaultY + Settings.local.volume.muteAniSpacing

    property string moveDirection: "down"
    property real volumeMuteDefaultY: (parent.height * 0.5) - (Settings.local.volume.muteAniSpacing * 0.5)

    Rectangle {
        id: muteAniBG
        width: Settings.local.volume.bgCircleDiameter
        height: width
        // volosd: Hearth/NuTV-style plate (was black circle)
        radius: 26
        antialiasing: true
        anchors.centerIn: parent
        border.width: 2
        border.color: "#24FFFFFF"
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#EB283048" }
            GradientStop { position: 1.0; color: "#EB0A0E16" }
        }
    }

    Canvas {
        id: iconMutedAni
        // volosd: light mute glyph (speaker + x), painted once
        width: 60
        height: 60
        anchors.centerIn: parent
        antialiasing: true
        renderTarget: Canvas.Image
        onPaint: {
            var c = getContext('2d');
            c.clearRect(0, 0, width, height);
            c.fillStyle = "#F2F4F8";
            c.strokeStyle = "#F2F4F8";
            c.lineJoin = "round";
            c.lineCap = "round";
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(8, 23); c.lineTo(19, 23); c.lineTo(32, 11); c.lineTo(32, 49); c.lineTo(19, 37); c.lineTo(8, 37);
            c.closePath();
            c.fill();
            c.stroke();
            c.lineWidth = 5;
            c.beginPath();
            c.moveTo(40, 23); c.lineTo(53, 37);
            c.moveTo(53, 23); c.lineTo(40, 37);
            c.stroke();
        }
    }

    ////animation data////
    Timer {
        id: moveTimer
        interval: Settings.local.volume.muteAniTime
        onTriggered: {
            if (root.isOpen)
                moveAni.restart();
        }
    }

    openAnimation: SequentialAnimation {
        PauseAnimation { duration: Settings.local.volume.muteAniDelayTime }
        PropertyAnimation {
            target: root
            properties: "opacity"
            to: 1.0
            duration: Settings.local.volume.muteMoveDuration
        }
        ScriptAction { script: moveTimer.restart(); }
    }

    closeAnimation: SequentialAnimation {
        ScriptAction { script: moveAni.stop(); }
        PropertyAnimation {
            target: root
            properties: "opacity"
            to: 0.0
            duration: Settings.local.volume.muteFadeInOutTime
        }
        ScriptAction { script: root.y = volumeMuteDefaultY + Settings.local.volume.muteAniSpacing; }
    }

    SequentialAnimation {
        id: moveAni
        NumberAnimation {
            target: root
            properties: "opacity"
            from: 1.0
            to: 0
            duration: Settings.local.volume.muteMoveDuration
        }
        ScriptAction { script:
            if (moveDirection == "down") {
                if (root.y == volumeMuteDefaultY + Settings.local.volume.muteAniSpacing) {
                    root.y -= Settings.local.volume.muteAniSpacing;
                    moveDirection = "up"
                } else {
                    root.y += Settings.local.volume.muteAniSpacing;
                }
            } else {
                if (root.y == volumeMuteDefaultY - Settings.local.volume.muteAniSpacing) {
                    root.y += Settings.local.volume.muteAniSpacing;
                    moveDirection = "down"
                } else {
                    root.y -= Settings.local.volume.muteAniSpacing;
                }
            }
        }
        PauseAnimation { duration: Settings.local.volume.muteAniDelayTime }
        NumberAnimation {
            target: root
            properties: "opacity"
            from: 0
            to: 1.0
            duration: Settings.local.volume.muteMoveDuration
        }
        ScriptAction { script: moveTimer.restart(); }
    }
}
