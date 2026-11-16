import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OtpChannel, RoleCode } from '../../common/auth/auth.types';

export class RegisterDto {
  @IsString() @MinLength(2, { message: 'Enter your full name.' }) @MaxLength(160)
  fullName!: string;

  @IsEmail({}, { message: 'Enter a valid email address.' }) @MaxLength(190)
  email!: string;

  @IsString({ message: 'Enter a 10-digit mobile number.' })
  @Matches(/^[0-9]{10}$|^\+[0-9]{11,14}$/, { message: 'Enter a 10-digit mobile number.' })
  phone!: string;

  @IsString()
  @MinLength(10, { message: 'Use at least 10 characters.' })
  @MaxLength(128)
  @Matches(/[A-Za-z]/, { message: 'Include at least one letter.' })
  @Matches(/[0-9]/, { message: 'Include at least one number.' })
  password!: string;

  @IsIn(['TENANT', 'OWNER', 'AGENT', 'BUILDER'], { message: 'Choose how you will use Odibrick.' })
  role!: RoleCode;

  @IsBoolean({ message: 'Please accept the terms of use and privacy policy.' })
  @Equals(true, { message: 'Please accept the terms of use and privacy policy.' })
  termsAccepted!: boolean;

  @IsOptional() @IsString() @MaxLength(32)
  termsVersion?: string;

  @IsOptional() @IsString() @MaxLength(190)
  organisationName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  city?: string;
}

export class SendOtpDto {
  @IsIn(['EMAIL', 'SMS'], { message: 'Choose EMAIL or SMS verification.' })
  channel!: OtpChannel;
}

export class VerifyOtpDto {
  @IsIn(['EMAIL', 'SMS'], { message: 'Choose EMAIL or SMS verification.' })
  channel!: OtpChannel;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Enter the 6-digit verification code.' })
  code!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}

export class RefreshDto {
  @IsOptional() @IsString() refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword!: string;
}
