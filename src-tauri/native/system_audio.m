// Core Audio owns synchronization of the microphone and process tap in one
// private aggregate device. No audio is written to disk by this bridge.
#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreAudio/AudioHardwareTapping.h>
#import <CoreAudio/CATapDescription.h>
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>

typedef struct {
    AudioObjectID tap, aggregate, microphone, output;
    AudioStreamBasicDescription tap_format;
} OGCapture;

static OSStatus read_property(AudioObjectID object, AudioObjectPropertySelector selector,
                              void *value, UInt32 size) {
    AudioObjectPropertyAddress address = {selector, kAudioObjectPropertyScopeGlobal,
                                         kAudioObjectPropertyElementMain};
    return AudioObjectGetPropertyData(object, &address, 0, NULL, &size, value);
}

void og_audio_destroy(OGCapture *capture) {
    if (!capture) return;
    // Caller must stop/drop its CPAL stream before destroying this device.
    if (capture->aggregate) AudioHardwareDestroyAggregateDevice(capture->aggregate);
    if (capture->tap) AudioHardwareDestroyProcessTap(capture->tap);
    free(capture);
}

OGCapture *og_audio_create(char *name, size_t name_capacity, int32_t *error) {
    @autoreleasepool {
        OGCapture *capture = calloc(1, sizeof(OGCapture));
        if (!capture) { *error = -1; return NULL; }
        OSStatus status;
        AudioObjectID process = kAudioObjectUnknown;
        pid_t pid = getpid();
        UInt32 size = sizeof(process);
        AudioObjectPropertyAddress address = {kAudioHardwarePropertyTranslatePIDToProcessObject,
            kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
        status = AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, sizeof(pid), &pid, &size, &process);
        if (status || !process) goto failure;
        status = read_property(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultInputDevice,
                               &capture->microphone, sizeof(capture->microphone));
        if (status || !capture->microphone) goto failure;
        status = read_property(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultOutputDevice,
                               &capture->output, sizeof(capture->output));
        if (status || !capture->output) goto failure;
        {
            CATapDescription *tap = [[CATapDescription alloc] initMonoGlobalTapButExcludeProcesses:@[@(process)]];
            tap.name = @"Open Granola system audio";
            tap.privateTap = YES;
            tap.muteBehavior = CATapUnmuted;
            status = AudioHardwareCreateProcessTap(tap, &capture->tap);
            if (status) goto failure;
            status = read_property(capture->tap, kAudioTapPropertyFormat, &capture->tap_format, sizeof(capture->tap_format));
            if (status) goto failure;
            CFStringRef mic_uid = NULL;
            status = read_property(capture->microphone, kAudioDevicePropertyDeviceUID, &mic_uid, sizeof(mic_uid));
            if (status || !mic_uid) goto failure;
            NSString *uid = CFBridgingRelease(mic_uid);
            NSString *device_name = [@"Open Granola capture " stringByAppendingString:NSUUID.UUID.UUIDString];
            NSDictionary *description = @{
                @kAudioAggregateDeviceNameKey: device_name,
                @kAudioAggregateDeviceUIDKey: NSUUID.UUID.UUIDString,
                @kAudioAggregateDeviceIsPrivateKey: @YES,
                @kAudioAggregateDeviceIsStackedKey: @NO,
                @kAudioAggregateDeviceMainSubDeviceKey: uid,
                @kAudioAggregateDeviceSubDeviceListKey: @[@{
                    @kAudioSubDeviceUIDKey: uid,
                    @kAudioSubDeviceDriftCompensationKey: @YES
                }],
                @kAudioAggregateDeviceTapListKey: @[@{
                    @kAudioSubTapUIDKey: tap.UUID.UUIDString,
                    @kAudioSubTapDriftCompensationKey: @YES
                }],
                @kAudioAggregateDeviceTapAutoStartKey: @YES
            };
            status = AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)description, &capture->aggregate);
            if (status) goto failure;
            snprintf(name, name_capacity, "%s", device_name.UTF8String);
        }
        *error = 0;
        return capture;
    failure:
        *error = status ? status : -1;
        og_audio_destroy(capture);
        return NULL;
    }
}

// Fail visibly on route changes rather than silently recording the wrong route.
int32_t og_audio_health(const OGCapture *capture) {
    AudioObjectID microphone = 0, output = 0;
    UInt32 alive = 0;
    AudioStreamBasicDescription format = {0};
    if (read_property(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultInputDevice, &microphone, sizeof(microphone)) ||
        read_property(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultOutputDevice, &output, sizeof(output)) ||
        microphone != capture->microphone || output != capture->output ||
        read_property(capture->aggregate, kAudioDevicePropertyDeviceIsAlive, &alive, sizeof(alive)) || !alive ||
        read_property(capture->tap, kAudioTapPropertyFormat, &format, sizeof(format)) ||
        format.mSampleRate != capture->tap_format.mSampleRate ||
        format.mChannelsPerFrame != capture->tap_format.mChannelsPerFrame) return -1;
    return 0;
}
