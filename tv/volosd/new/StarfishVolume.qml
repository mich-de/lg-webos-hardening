/* @@@LICENSE
 *
 * Copyright (c) 2013-2021 LG Electronics, Inc.
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
import QtQuick.Window 2.2

BaseView {
    id: root
    anchors.right: parent.right

    //local values from tv service
    // In partial view, bluetooth scenario looks like exterior scenarios.
    property bool partialViewState: false
    property bool partialViewBluetooth: (sourceType === "volume_icon_bluetooth" || sourceType === "volume_icon_speaker_bluetooth") && partialViewState
    property bool exterior: LS.audioService.soundOutput === "external_optical" ||
                            LS.audioService.soundOutput === "external_arc" ||
                            LS.audioService.soundOutput === "lineout" ||
                            LS.audioService.soundOutput === "urcu_oss" ||
                            partialViewBluetooth
    property string volumeDirectionString: ""
    property string sourceType: ""
    property string previousSourceType: ""
    property string exteriorVolumeCause: ""

    //text for audio guidance
    property string volumeStr: qsTr("volume") + Settings.l10n.tr // i18n If the volume state is changed, request audio guidance with this string
    property string upStr: qsTr("up") + Settings.l10n.tr // i18n If exact volume level is not available, give audio guidance with 'volume up'
    property string downStr: qsTr("down") + Settings.l10n.tr // i18n If exact volume level is not available, give audio guidance with 'volume down'
    property string volumeDisabledStr: qsTr("The device's volume is not controllable with TV remote") + Settings.l10n.tr // i18n If volume control is not available, give audio guidance with this message.

    // NOTE : some system UIs vary by rolling screen state (A+)
    property int viewIndex: partialViewState ? 1 : 0

    property real volumeBarLength: 0

    //local val for front-disp-panel
    property string sourceIconImage: ""

    property real devicePixelRatio: Screen.devicePixelRatio

    onDevicePixelRatioChanged: {
        console.info("devicePixelRatio for volumeCanvas: " +devicePixelRatio);
    }

    function update() {
        switch (LS.audioService.soundOutput) {
        case "external_optical":
        case "external_arc":
        case "lineout":
        case "urcu_oss":
            root.sourceType = "volume_exterior";
            if (LS.audioService.cause === "volumeUp") {
                root.volumeDirectionString = "up";
                root.sourceIconImage = Settings.local.volume.imageExteriorUp;
            } else if (LS.audioService.cause === "volumeDown") {
                root.volumeDirectionString = "down";
                root.sourceIconImage = Settings.local.volume.imageExteriorDown;
            }
            break;
        case "headphone":
            root.sourceType = "volume_icon_headset";
            root.sourceIconImage = Settings.local.volume.imageHeadphones;
            break;
        case "bt_soundbar":
            root.sourceType = "volume_icon_bluetooth";
            root.sourceIconImage = Settings.local.volume.imageBluetooth;
            if (LS.audioService.cause === "volumeUp")
                root.volumeDirectionString = "up";
            else if (LS.audioService.cause === "volumeDown")
                root.volumeDirectionString = "down";
            break;
        case "wisa_speaker":
            root.sourceType = "volume_icon_wisa";
            root.sourceIconImage = Settings.local.volume.imageWisa;
            break;
        case "tv_speaker_bluetooth":
            root.sourceType = "volume_icon_speaker_bluetooth";
            root.sourceIconImage = Settings.local.volume.imageSpeakerBluetooth;
            if (LS.audioService.cause === "volumeUp")
                root.volumeDirectionString = "up";
            else if (LS.audioService.cause === "volumeDown")
                root.volumeDirectionString = "down";
            break;
        default:
            // soundOutput : tv_speaker, tv_external_speaker, tv_speaker_headphone,
            //               lgSoundSync, external_arc_sc
            root.sourceType = "volume_icon";
            root.sourceIconImage = Settings.local.volume.imageSpeaker;
            break;
        }

        if (LS.audioService.muted || LS.audioService.disabled)
            volume.exteriorVolumeCause = "";

        if (LS.audioService.cause !== "")
            root.exteriorVolumeCause = LS.audioService.cause;

        if (!LS.audioService.muted && !LS.audioService.disabled) {
            // If exterior icon is kept, start repeat animation to give some effect on icon
            if (root.previousSourceType === root.sourceType && root.sourceType === "volume_exterior") {
                if (!repeatAnimation.running && LS.audioService.cause !== "") {
                    repeatAnimation.start();
                }
            }
            if (root.previousSourceType === root.sourceType && partialViewBluetooth && LS.audioService.cause !== "") {
                if (!repeatAnimation.running)
                    repeatAnimation.start();
            }
            root.previousSourceType = root.sourceType;
        } else {
            root.previousSourceType = "";
        }

        // volosd: volume level is drawn by bound Rectangles, no canvas repaint needed
    }

    function restartClosingTimer() {
        closingTimer.restart();
    }

    Item {
        id: indicator
        height: Settings.local.volume.viewStyle[viewIndex].barHeight
        width: height
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter

        property bool volumeBarVisible: !(LS.audioService.muted || LS.audioService.disabled || exterior) && !partialViewState
        property bool volumeLevelIconVisible: !(LS.audioService.muted || LS.audioService.disabled || exterior)
        property bool volumeRowVisible: !(root.sourceType === "volume_icon_bluetooth") && !(root.sourceType === "volume_icon_speaker_bluetooth")

        Image {
            height: parent.height
            anchors.right: parent.right
            source: Settings.local.volume.imageVolumeMask
            fillMode: Image.Stretch
            visible: partialViewState
        }

        onVolumeRowVisibleChanged: {
            if (volumeRowVisible)
                state = "visibleVolumeRow";
            else
                state = "invisibleVolumeRow";
        }

        // volosd: Hearth/NuTV-style plate (replaces LG number images, canvas bar, +/- icons)
        property real levelRatio: Math.max(0, Math.min(1, root.volumeBarLength / Settings.local.volume.barRectHeight))
        property bool wideIcon: root.sourceType === "volume_icon_speaker_bluetooth"

        Rectangle {
            id: volumePlate
            width: indicator.wideIcon ? 156 : 120
            height: indicator.volumeBarVisible ? Settings.local.volume.viewStyle[viewIndex].barHeight : 220
            anchors.right: parent.right
            anchors.rightMargin: Settings.local.volume.rightMargin
            anchors.verticalCenter: parent.verticalCenter
            radius: 28
            antialiasing: true
            border.width: 2
            border.color: "#24FFFFFF"
            gradient: Gradient {
                GradientStop { position: 0.0; color: "#EB283048" }
                GradientStop { position: 1.0; color: "#EB0A0E16" }
            }
            visible: indicator.volumeLevelIconVisible

            Text {
                id: volumeNumber
                anchors.top: parent.top
                anchors.topMargin: 22
                anchors.horizontalCenter: parent.horizontalCenter
                text: (LS.audioService.volume === undefined || LS.audioService.volume < 0) ? "" : LS.audioService.volume.toString()
                color: "#F2F4F8"
                font.family: "LG Smart UI"
                font.pixelSize: 58
                font.weight: Font.DemiBold
                visible: indicator.volumeRowVisible
            }

            Rectangle {
                id: volumeBar
                width: 14
                radius: 7
                antialiasing: true
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.top: parent.top
                anchors.topMargin: 108
                anchors.bottom: sourceIcon.top
                anchors.bottomMargin: 28
                color: "#2EF2F4F8"
                visible: indicator.volumeBarVisible

                Rectangle {
                    id: volumeFill
                    width: parent.width
                    radius: 7
                    antialiasing: true
                    anchors.bottom: parent.bottom
                    height: indicator.levelRatio > 0 ? Math.max(parent.width, parent.height * indicator.levelRatio) : 0
                    color: "#F2F4F8"
                    Behavior on height { NumberAnimation { duration: 120 } }
                }
            }

            Image {
                id: sourceIcon
                source: sourceIconImage
                width: indicator.wideIcon ? Settings.local.volume.iconWideSize : Settings.local.volume.iconSize
                height: Settings.local.volume.iconSize
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 30
            }
        }

        states: [
            State { name: "visibleVolumeRow" },
            State { name: "invisibleVolumeRow" }
        ]

        Item {
            id: noVolumeBarIcons
            width: Settings.local.volume.bgCircleDiameter
            height: width
            anchors.verticalCenter: parent.verticalCenter
            anchors.right: parent.right
            anchors.rightMargin: Settings.local.volume.rightMargin

            Rectangle {
                id: noVolumeBarIconsBG
                radius: 26
                antialiasing: true
                border.width: 2
                border.color: "#24FFFFFF"
                gradient: Gradient {
                    GradientStop { position: 0.0; color: "#EB283048" }
                    GradientStop { position: 1.0; color: "#EB0A0E16" }
                }
                anchors.fill: parent
                visible: LS.audioService.muted || LS.audioService.disabled
            }

            Canvas {
                id: iconMuted
                // volosd: light mute glyph (speaker + x), painted once
                width: 60
                height: 60
                anchors.centerIn: parent
                antialiasing: true
                renderTarget: Canvas.Image
                visible: LS.audioService.muted && !LS.audioService.disabled
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

            Image {
                id: iconDisabled
                source: Settings.local.volume.imageDisabled
                width: Settings.local.volume.bgIconSize
                height: width
                anchors.centerIn: parent
                visible: LS.audioService.disabled
            }
        }

        Item {
            width: Settings.local.volume.exteriorWidth
            height: Settings.local.volume.exteriorHeight

            anchors.verticalCenter: parent.verticalCenter
            anchors.right: parent.right
            anchors.rightMargin: 39

            Image {
                id: iconExterior
                source: partialViewBluetooth ? Settings.local.volume.imageExteriorBt : Settings.local.volume.viewStyle[viewIndex].imageExteriorBg
                width: Settings.local.volume.exteriorWidth
                height: Settings.local.volume.exteriorHeight
                anchors.fill: parent
                visible: exterior && (root.exteriorVolumeCause === "volumeUp" || root.exteriorVolumeCause === "volumeDown") && !LS.audioService.disabled
            }

            Image {
                id: iconExtUp
                source: Settings.local.volume.imageExteriorUp
                width: Settings.local.volume.extUpDownSize
                height: Settings.local.volume.extUpDownSize
                anchors.right: iconExterior.right
                anchors.rightMargin: Settings.local.volume.extUpDownMargin
                anchors.top: iconExterior.top
                anchors.topMargin: Settings.local.volume.extUpDownMargin
                visible: exterior && root.exteriorVolumeCause === "volumeDown" && !LS.audioService.disabled
            }

            Image {
                id: iconExtDown
                source: Settings.local.volume.imageExteriorDown
                width: Settings.local.volume.extUpDownSize
                height: Settings.local.volume.extUpDownSize
                anchors.right: iconExterior.right
                anchors.rightMargin: Settings.local.volume.extUpDownMargin
                anchors.bottom: iconExterior.bottom
                anchors.bottomMargin: Settings.local.volume.extUpDownMargin
                visible: exterior && root.exteriorVolumeCause === "volumeUp" && !LS.audioService.disabled
            }

            Item {
                id: highlightIcons
                opacity: 1.0
                visible: exterior && !LS.audioService.disabled
                width: Settings.local.volume.exteriorWidth
                height: Settings.local.volume.exteriorHeight
                anchors.fill: parent

                Image {
                    id: iconExtUpHighlighted
                    source: Settings.local.volume.imageExteriorUpHighlighted
                    width: Settings.local.volume.extUpDownSize
                    height: Settings.local.volume.extUpDownSize
                    anchors.right: highlightIcons.right
                    anchors.rightMargin: Settings.local.volume.extUpDownMargin
                    anchors.top: highlightIcons.top
                    anchors.topMargin: Settings.local.volume.extUpDownMargin
                    visible: root.exteriorVolumeCause === "volumeUp"
                }

                Image {
                    id: iconExtDownHighlighted
                    source: Settings.local.volume.imageExteriorDownHighlighted
                    width: Settings.local.volume.extUpDownSize
                    height: Settings.local.volume.extUpDownSize
                    anchors.right: highlightIcons.right
                    anchors.rightMargin: Settings.local.volume.extUpDownMargin
                    anchors.bottom: highlightIcons.bottom
                    anchors.bottomMargin: Settings.local.volume.extUpDownMargin
                    visible: root.exteriorVolumeCause === "volumeDown"
                }
            }
        }
    }

    ////animation data////
    Timer {
        id: closingTimer
        interval: LS.audioService.muted && !LS.audioService.disabled ? Settings.local.volume.muteAniTime : Settings.local.volume.showingTime
        onTriggered: {
            root.closeView();
        }
    }

    SequentialAnimation {
        id : repeatAnimation
        PropertyAnimation {
            target: highlightIcons
            properties: "opacity"
            duration: 150
            from: 1.0
            to: 0.0
        }
        PauseAnimation {
            duration: 200
        }
        PropertyAnimation {
            target: highlightIcons
            properties: "opacity"
            duration: 150
            from: 0.0
            to: 1.0
        }
        onRunningChanged: {
            if (!running)
                highlightIcons.opacity = 1.0;
        }
    }

    openAnimation: SequentialAnimation {
        ScriptAction { script: closingTimer.restart(); }
        PropertyAnimation {
            target: indicator
            properties: "opacity"
            to: 1.0
            duration: Settings.local.volume.fadeAnimationDuration
        }
        ScriptAction { script: Utils.pmLog.info("VOLUME_UI_SHOWN", {"PerfType":"Boot", "PerfGroup":"Platform"}, "", true); }
    }

    closeAnimation: SequentialAnimation {
        ScriptAction { script: root.previousSourceType = ""; }
        PropertyAnimation {
            target: indicator
            properties: "opacity"
            to: 0.0
            duration: LS.audioService.muted ? Settings.local.volume.muteMoveDuration : Settings.local.volume.fadeAnimationDuration
        }
    }
}
