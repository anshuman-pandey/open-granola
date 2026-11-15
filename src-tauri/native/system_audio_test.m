// Hardware-free failure injection: every HAL call is replaced before the bridge
// is compiled. This executable never creates a real tap or audio device.
#define AudioObjectGetPropertyData fake_read
#define AudioHardwareCreateProcessTap fake_create_tap
#define AudioHardwareDestroyProcessTap fake_destroy_tap
#define AudioHardwareCreateAggregateDevice fake_create_aggregate
#define AudioHardwareDestroyAggregateDevice fake_destroy_aggregate
#include "system_audio.m"
#include <assert.h>
#include <string.h>

static int step, fail_at, taps_destroyed, aggregates_destroyed;
static AudioObjectID input_route = 10, output_route = 20;
OSStatus fake_read(AudioObjectID object, const AudioObjectPropertyAddress *address,
                   UInt32 qualifier_size, const void *qualifier, UInt32 *size, void *data) {
    (void)object; (void)qualifier_size; (void)qualifier; (void)size;
    if (++step == fail_at) return -50;
    switch (address->mSelector) {
        case kAudioHardwarePropertyTranslatePIDToProcessObject: *(AudioObjectID *)data = 5; break;
        case kAudioHardwarePropertyDefaultInputDevice: *(AudioObjectID *)data = input_route; break;
        case kAudioHardwarePropertyDefaultOutputDevice: *(AudioObjectID *)data = output_route; break;
        case kAudioDevicePropertyDeviceUID: *(CFStringRef *)data = CFRetain(CFSTR("fake-microphone")); break;
        case kAudioDevicePropertyDeviceIsAlive: *(UInt32 *)data = 1; break;
        case kAudioTapPropertyFormat: {
            AudioStreamBasicDescription format = {0}; format.mSampleRate = 48000; format.mChannelsPerFrame = 1;
            memcpy(data, &format, sizeof(format)); break;
        }
        default: assert(0);
    }
    return 0;
}
OSStatus fake_create_tap(CATapDescription *description, AudioObjectID *tap) {
    assert(description.isPrivate);
    assert(description.muteBehavior == CATapUnmuted);
    assert([description.processes isEqualToArray:@[@5]]);
    if (++step == fail_at) return -50;
    *tap = 30; return 0;
}
OSStatus fake_destroy_tap(AudioObjectID tap) { assert(tap == 30); taps_destroyed++; return 0; }
OSStatus fake_create_aggregate(CFDictionaryRef dictionary, AudioObjectID *aggregate) {
    NSDictionary *d = (__bridge NSDictionary *)dictionary;
    assert([d[@kAudioAggregateDeviceIsPrivateKey] boolValue]);
    assert([d[@kAudioAggregateDeviceSubDeviceListKey] count] == 1);
    assert([d[@kAudioAggregateDeviceTapListKey] count] == 1);
    assert([d[@kAudioAggregateDeviceMainSubDeviceKey] isEqualToString:@"fake-microphone"]);
    assert([d[@kAudioAggregateDeviceTapListKey][0][@kAudioSubTapDriftCompensationKey] boolValue]);
    if (++step == fail_at) return -50;
    *aggregate = 40; return 0;
}
OSStatus fake_destroy_aggregate(AudioObjectID aggregate) {
    assert(aggregate == 40); assert(taps_destroyed == 0); aggregates_destroyed++; return 0;
}
int main(void) {
    @autoreleasepool {
        for (int failure = 1; failure <= 7; failure++) {
            step = taps_destroyed = aggregates_destroyed = 0; fail_at = failure;
            char name[128] = {0}; int32_t error = 0;
            assert(og_audio_create(name, sizeof(name), &error) == NULL);
            assert(error == -50);
            assert(taps_destroyed == (failure > 4));
            assert(aggregates_destroyed == 0);
        }
        step = fail_at = taps_destroyed = aggregates_destroyed = 0;
        char name[128] = {0}; int32_t error = -1;
        OGCapture *capture = og_audio_create(name, sizeof(name), &error);
        assert(capture && error == 0 && strlen(name));
        assert(og_audio_health(capture) == 0);
        output_route = 99;
        assert(og_audio_health(capture) != 0);
        og_audio_destroy(capture);
        assert(taps_destroyed == 1 && aggregates_destroyed == 1);
        og_audio_destroy(NULL);
        puts("System audio: seven startup failure paths, route-change detection, private capture and ordered cleanup passed (mock HAL only).");
    }
}
