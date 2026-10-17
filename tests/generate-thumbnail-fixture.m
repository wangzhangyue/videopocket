#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#include <math.h>
int main(int argc,char **argv){@autoreleasepool{
 NSError *error=nil;
 AVAssetWriter *writer=[[AVAssetWriter alloc] initWithURL:[NSURL fileURLWithPath:@(argv[1])] fileType:AVFileTypeMPEG4 error:&error];
 AVAssetWriterInput *input=[AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:@{AVVideoCodecKey:AVVideoCodecTypeH264,AVVideoWidthKey:@320,AVVideoHeightKey:@180}];
 AVAssetWriterInputPixelBufferAdaptor *adaptor=[AVAssetWriterInputPixelBufferAdaptor assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input sourcePixelBufferAttributes:nil];
 [writer addInput:input];[writer startWriting];[writer startSessionAtSourceTime:kCMTimeZero];
 for(int f=0;f<30;f++){
  while(!input.readyForMoreMediaData){if(writer.status==AVAssetWriterStatusFailed){NSLog(@"%@",writer.error);return 1;}[NSThread sleepForTimeInterval:0.01];}
  CVPixelBufferRef b;CVPixelBufferCreate(NULL,320,180,kCVPixelFormatType_32ARGB,NULL,&b);CVPixelBufferLockBaseAddress(b,0);
  unsigned char *p=CVPixelBufferGetBaseAddress(b);size_t stride=CVPixelBufferGetBytesPerRow(b);
  for(int y=0;y<180;y++)for(int x=0;x<320;x++){size_t i=y*stride+x*4;bool hill=y>90+25*sin(x/42.0);p[i]=255;p[i+1]=hill?59:160;p[i+2]=hill?99:193;p[i+3]=hill?75:205;}
  CVPixelBufferUnlockBaseAddress(b,0);[adaptor appendPixelBuffer:b withPresentationTime:CMTimeMake(f,30)];CVPixelBufferRelease(b);
 }
 [input markAsFinished];dispatch_semaphore_t sem=dispatch_semaphore_create(0);[writer finishWritingWithCompletionHandler:^{dispatch_semaphore_signal(sem);}];dispatch_semaphore_wait(sem,DISPATCH_TIME_FOREVER);
 if(writer.status!=AVAssetWriterStatusCompleted){NSLog(@"%@",writer.error);return 1;}
}return 0;}
